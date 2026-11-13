// BL2-04 (FDY-280) lane runner, extended by BL2-05 (FDY-281) with the sourced generator.
//
//   node scripts/lanes/run.mjs --lane <lane> [--quota N] [--dry-run] [--fixtures <dir>] [--evidence <dir>]
//                              [--emit <dir>] [--width 3] [--no-render] [--no-llm] [--flush-every N]
//
// For one lane: read briefing_lanes (daily_quota, cursor), select candidate briefings (status in
// planned|draft, tier set, briefing_type set, matching the lane), call generate(brief) for each —
// `--width` briefs at a time (default 3) — stage ONE briefings_versions row (kind='draft',
// status='draft', version = briefings.version + 1, job='lane-<lane>') carrying every editorial
// column + the manuscript, and log "DRAFTED" (sentence = tier, page count, source count) to the
// status page. The live briefings row is never touched (BL-10 rule). One automation_health_log
// row per run.
//
// BL2-05 additions
//   - generate() is the sourced generator (generate.mjs): evidence from Faraday records only,
//     tier template honoured exactly, render check (Playwright PDF page count) with re-composition
//     to the tier range; out-of-range drafts are STILL staged and logged `G1-AUTO · FAIL` with the
//     count. Thin Profiles (< 6 sourced Signals) write a briefing_reviews G1-AUTO blocker "thin"
//     and are still staged.
//   - manuscript_md: written to the dedicated column when the BL2-05 migration has been applied
//     (probed once per run); otherwise stored as contents[0] with the sections after it.
//   - --emit <dir>: also write each manuscript as <dir>/<lane>-<slug>.md (used for the PR samples).
//   - Evidence source: Supabase (service role) in live runs; scripts/lanes/fixtures/evidence/*.json
//     (packs captured read-only from production) in fixture/dry runs.
//
// BL3-05 (FDY-329) — Profile lanes (companies, institutions); gates and ranking in gates.mjs
//   - Ranked, never id order: companies by company_signal_rollup (mentions_30d desc, artifact_count
//     desc, title; companies missing from the rollup after the ranked ones), institutions by ONE
//     grouped sourced-Signal count over every eligible institution Profile.
//   - Pre-draft gate: each candidate's evidence pack is fetched (and reused by generate()) and passed
//     to preDraftGate(lane, pack); a Profile with < 6 sourced Signals is SKIPPED — no draft, no
//     briefings_versions row, no briefing_reviews row — summarised "skipped: thin (n<6)".
//   - Quota counts STAGED drafts only; ranked candidates are drawn until `quota` drafts are staged or
//     10 × quota evidence packs have been fetched. Briefs whose next draft is already staged are not
//     drawn again.
//   - Cursor: cursor.skipped = [{ id, n, checked_at }] (re-checked after 7 days), MERGED into the
//     existing briefing_lanes.cursor object — cursor.requeue (BL2-06 review chain) always survives. A
//     requeue entry for a thin Profile is reported "skipped: thin (n<6)" and left in place.
//   - --census: measure every eligible Profile in the lane, list who clears the floor, write nothing.
//   - Every lane: updateLaneCursor() merges into the stored cursor instead of replacing it.
//
// Safety (unchanged): service role only; --dry-run writes nothing anywhere and prints every line;
// per-brief try/catch; cursor checkpointed after every brief (monotonic across the `--width` window).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStatusLog } from '../statuslog.mjs';
import { generate as sourcedGenerate, PAGE_RANGE } from './generate.mjs';
import { buildPack, createFixtureEvidence, createSupabaseEvidence, evidenceWindow } from './evidence.mjs';
import { FETCH_FACTOR, PROFILE_FLOOR, THIN_SKIP, dropSkipped, freshSkipped, groupedInstitutionCounts, isGatedLane, isProfileLane, preDraftGate, rankCompanies, rankInstitutions, readSkipped, upsertSkipped } from './gates.mjs';
import { createPolisher } from './llm.mjs';

export const LANES = Object.freeze(['theaters', 'domains', 'subdomains', 'companies', 'states', 'countries', 'institutions']);

/** briefing_type values each lane draws from (public vocabulary; 'company'/'jurisdiction' landed with BL2-01). */
export const LANE_TYPES = Object.freeze({
  theaters: ['theater'],
  domains: ['sector'],
  subdomains: ['thread'],
  companies: ['company'],
  institutions: ['company'],
  states: ['jurisdiction'],
  countries: ['jurisdiction'],
});

export const ELIGIBLE_STATUSES = Object.freeze(['planned', 'draft']);
export const JOB_PREFIX = 'lane-';
export const CRAWLER_ID = 'briefing-lane-runner_v0.2';
// Provisional until the Automation Registry grants an id (do NOT self-assign a number).
export const AUTO_ID = 'AUTO-PROVISIONAL';
export const DEFAULT_FLUSH_EVERY = 10;
export const DEFAULT_WIDTH = 3;

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(HERE, 'fixtures');
export const EVIDENCE_FIXTURES_DIR = join(HERE, 'fixtures', 'evidence');

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const out = { lane: undefined, quota: undefined, dryRun: false, census: false, fixtures: undefined, evidence: undefined, emit: null, width: DEFAULT_WIDTH, render: true, llm: true, flushEvery: DEFAULT_FLUSH_EVERY };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--lane') out.lane = argv[++i];
    else if (a === '--quota') out.quota = Number(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--census') {
      out.census = true;
      out.dryRun = true; // a census never writes
    } else if (a === '--fixtures') out.fixtures = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : FIXTURES_DIR;
    else if (a === '--evidence') out.evidence = argv[++i];
    else if (a === '--emit') out.emit = argv[++i];
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--no-render') out.render = false;
    else if (a === '--no-llm') out.llm = false;
    else if (a === '--flush-every') out.flushEvery = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.lane) throw new Error('--lane <lane> is required');
  if (!LANES.includes(out.lane)) throw new Error(`--lane must be one of ${LANES.join('|')}, got "${out.lane}"`);
  if (out.quota !== undefined && !(Number.isInteger(out.quota) && out.quota > 0)) throw new Error('--quota must be a positive integer');
  if (!(Number.isInteger(out.width) && out.width > 0)) throw new Error('--width must be a positive integer');
  if (out.census && !isProfileLane(out.lane)) throw new Error('--census applies to the companies and institutions lanes only');
  return out;
}

/** Decode the `role` claim of a Supabase JWT without verifying it (the server verifies; we only refuse the wrong key). */
export function decodeJwtRole(key) {
  if (typeof key !== 'string') return null;
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload?.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function assertServiceRole(key) {
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  const role = decodeJwtRole(key);
  if (role !== 'service_role') throw new Error(`refusing to run: key role is "${role ?? 'unreadable'}", not service_role`);
}

/** Base eligibility shared by every lane. */
export function isEligible(b) {
  return ELIGIBLE_STATUSES.includes(b?.status) && Boolean(b?.tier) && Boolean(b?.briefing_type);
}

/** Lane membership. jurisdiction_id is 'US-XX' for states, ISO-3166 alpha-2 for countries (BL2-01). */
export function matchesLane(b, lane) {
  if (!LANE_TYPES[lane]?.includes(b?.briefing_type)) return false;
  switch (lane) {
    case 'companies':
      return Boolean(b.company_id);
    case 'institutions':
      return !b.company_id && Boolean(b.institution_id);
    case 'states':
      return typeof b.jurisdiction_id === 'string' && /^US-[A-Z]{2}$/.test(b.jurisdiction_id);
    case 'countries':
      return typeof b.jurisdiction_id === 'string' && /^[A-Z]{2}$/.test(b.jurisdiction_id);
    default:
      return true;
  }
}

export function selectCandidates(rows, { lane, afterId = null, limit }) {
  return rows
    .filter((b) => isEligible(b) && matchesLane(b, lane))
    .filter((b) => (afterId ? String(b.id) > String(afterId) : true))
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1))
    .slice(0, limit);
}

/**
 * The briefings_versions row for one generated draft.
 * `manuscriptColumn=false` (BL2-05 migration not applied yet) stores the manuscript as contents[0].
 */
export function buildDraftRow(brief, gen, lane, { manuscriptColumn = true } = {}) {
  const sections = gen.contents ?? [];
  const row = {
    briefing_id: brief.id,
    version: Number(brief.version ?? 1) + 1,
    kind: 'draft',
    status: 'draft',
    title: gen.title ?? brief.title,
    tier: brief.tier,
    page_target: brief.page_target ?? null,
    sector_id: brief.sector_id ?? null,
    thread_id: brief.thread_id ?? null,
    theme_tags: brief.theme_tags ?? [],
    source_refs: gen.source_refs ?? [],
    institution_id: brief.institution_id ?? null,
    company_id: brief.company_id ?? null,
    briefing_type: brief.briefing_type,
    byline: gen.byline ?? null,
    hypothesis: gen.hypothesis ?? null,
    contents: manuscriptColumn || !gen.manuscript_md ? sections : [gen.manuscript_md, ...sections],
    last_refreshed: null,
    published_at: null,
    job: `${JOB_PREFIX}${lane}`,
    evidence_from: gen.evidence_from ?? null,
    evidence_to: gen.evidence_to ?? null,
    created_by: CRAWLER_ID,
  };
  if (manuscriptColumn && gen.manuscript_md) row.manuscript_md = gen.manuscript_md;
  // Only carried once BL2-01 has added the column to both tables.
  if (brief.jurisdiction_id !== undefined) row.jurisdiction_id = brief.jurisdiction_id;
  return row;
}

/** briefing_reviews row for an automatic G1 blocker (thin Profile, page range). */
export function buildReviewRow(brief, version, blockers, notes) {
  return { briefing_id: brief.id, version, gate: 'G1-AUTO', reviewer: CRAWLER_ID, result: 'FAIL', score: null, blockers, notes };
}

export const isUniqueViolation = (e) => e?.code === '23505' || /duplicate key|unique constraint|briefings_versions_uniq/i.test(e?.message ?? '');

export const slugify = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** The DRAFTED status-log sentence: tier, page count, source count (FDY-281). */
export function draftedSentence(brief, gen, version) {
  const pages = gen.render_checked ? `${gen.pages} pp` : 'pages unmeasured';
  return `Staged draft v${version} of "${brief.title}" (${brief.tier}, ${pages}, ${gen.source_count ?? gen.source_refs?.length ?? 0} sources).`;
}

// ---------------------------------------------------------------------------------------------
// Data access — two implementations of one interface
// ---------------------------------------------------------------------------------------------

/**
 * In-memory db from fixtures (or any plain objects). Writes are recorded, never sent anywhere.
 * BL3-05 extras: `rollup` (company_signal_rollup rows), `institutions` ({ institution_uid, company_uid }),
 * `institutionSignals` (raw signals with `.artifact`, for the grouped institution count), `versions`
 * (already-staged briefings_versions rows).
 * @param {{lanes?: any[], briefings?: any[], rollup?: any[], institutions?: any[], institutionSignals?: any[], versions?: any[], manuscriptColumn?: boolean}} [opts]
 */
export function createFixtureDb({ lanes = [], briefings = [], rollup = [], institutions = [], institutionSignals = [], versions = [], manuscriptColumn = true } = {}) {
  const laneRows = new Map(lanes.map((l) => [l.lane, { ...l }]));
  const rollupByUid = new Map(rollup.map((r) => [r.company_uid, r]));
  const uidByInstitution = new Map(institutions.map((i) => [i.institution_uid, i.company_uid]));
  /** @type {{versions: any[], cursors: any[], health: any[], reviews: any[]}} */
  const writes = { versions: [], cursors: [], health: [], reviews: [] };
  return {
    kind: 'fixture',
    writes,
    async getLane(lane) {
      return laneRows.get(lane) ?? null;
    },
    async listCandidates({ lane, afterId, limit }) {
      return selectCandidates(briefings, { lane, afterId, limit });
    },
    /** BL3-05: every eligible Profile of the lane, ranked (see gates.mjs). */
    async listProfileCandidates({ lane, now = new Date() }) {
      const rows = briefings.filter((b) => isEligible(b) && matchesLane(b, lane));
      if (lane === 'companies') return { ranked: rankCompanies(rows, rollupByUid), counts: null };
      const counts = groupedInstitutionCounts(rows, uidByInstitution, institutionSignals, now);
      return { ranked: rankInstitutions(rows, counts), counts };
    },
    /** Ids of briefs whose next draft (version + 1) is already staged. */
    async stagedDraftIds(briefs) {
      const all = [...versions, ...writes.versions];
      return new Set(briefs.filter((b) => all.some((v) => v.briefing_id === b.id && v.kind === 'draft' && v.version === Number(b.version ?? 1) + 1)).map((b) => b.id));
    },
    async hasManuscriptColumn() {
      return manuscriptColumn;
    },
    async insertDraftVersion(row) {
      if (writes.versions.some((v) => v.briefing_id === row.briefing_id && v.version === row.version && v.kind === row.kind)) {
        const e = new Error('duplicate key value violates unique constraint "briefings_versions_uniq"');
        e.code = '23505';
        throw e;
      }
      writes.versions.push(row);
      return row;
    },
    async insertReview(row) {
      writes.reviews.push(row);
    },
    /** Merges into the stored cursor (keys this runner does not own, e.g. `requeue`, survive). */
    async updateLaneCursor(lane, cursor) {
      const l = laneRows.get(lane);
      const merged = { ...(l?.cursor && typeof l.cursor === 'object' ? l.cursor : {}), ...cursor };
      if (l) l.cursor = merged;
      writes.cursors.push({ lane, cursor: merged });
    },
    async insertHealth(row) {
      writes.health.push(row);
    },
  };
}

export function loadFixtures(dir = FIXTURES_DIR) {
  const read = (name) => {
    const p = join(dir, name);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
  };
  return { lanes: read('briefing_lanes.json'), briefings: read('briefings.json'), rollup: read('company_signal_rollup.json'), institutions: read('institutions.json'), institutionSignals: read('institution_signals.json') };
}

/** Upper bound on one Profile-lane read (PostgREST's default max-rows is 1000; the shelf is far below it). */
export const PROFILE_FETCH_MAX = 1000;
/** Columns the grouped institution count needs (a subset of evidence.mjs's signal columns). */
const COUNT_SIGNAL_COLS = 'id, fired_at, event_date, framing, faradays_take, company_tags, source_url, artifact_id';
const envelopeOf = (a) => ({
  title: a?.signal_envelope?.title ?? null,
  source_name: a?.signal_envelope?.source_name ?? null,
  summary: a?.signal_envelope?.summary ? String(a.signal_envelope.summary).slice(0, 1500) : null,
  published_at: a?.published_at ?? null,
  license_status: a?.signal_envelope?.license_status ?? null,
  source_url: a?.source_url ?? null,
});

const MISSING_TABLE = (error) => error?.code === 'PGRST205' || error?.code === '42P01';
const MISSING_COLUMN = (error) => error?.code === '42703' || error?.code === 'PGRST204' || /column .*manuscript_md.* does not exist/i.test(error?.message ?? '');

/** Supabase-backed db over a service-role client. */
export function createSupabaseDb(client) {
  return {
    kind: 'supabase',
    async getLane(lane) {
      const { data, error } = await client.from('briefing_lanes').select('*').eq('lane', lane).maybeSingle();
      if (error) {
        if (MISSING_TABLE(error)) return undefined; // BL2-01 not applied yet
        throw error;
      }
      return data ?? null;
    },
    async listCandidates({ lane, afterId, limit }) {
      // Over-fetch on the indexed predicates, then apply the lane's sub-filter in JS.
      let q = client
        .from('briefings')
        .select('*')
        .in('status', ELIGIBLE_STATUSES)
        .not('tier', 'is', null)
        .not('briefing_type', 'is', null)
        .in('briefing_type', LANE_TYPES[lane])
        .order('id', { ascending: true })
        .limit(Math.max(limit * 4, 20));
      // Lane sub-filters that SQL can express go into the query too: `company` rows are ~4.5× as many
      // as institution rows, so the JS-only filter starved the institutions lane (2 of 20 over-fetched
      // rows on the first live run, FDY-284). selectCandidates() still applies the same rule after.
      if (lane === 'companies') q = q.not('company_id', 'is', null);
      else if (lane === 'institutions') q = q.is('company_id', null).not('institution_id', 'is', null);
      else if (lane === 'states') q = q.like('jurisdiction_id', 'US-__');
      else if (lane === 'countries') q = q.not('jurisdiction_id', 'is', null).not('jurisdiction_id', 'like', 'US-%');
      if (afterId) q = q.gt('id', afterId);
      const { data, error } = await q;
      if (error) throw error;
      return selectCandidates(data ?? [], { lane, afterId: null, limit });
    },
    /**
     * BL3-05: every eligible Profile of the lane, ranked. Companies: company_signal_rollup.
     * Institutions: one grouped count — the institutions' company_uids, every Signal tagged with one
     * of them in the Profile window (12 months) with its artifact envelope, normalised per brief by
     * buildPack() and counted with the gate's sourced-Signal rule.
     */
    async listProfileCandidates({ lane, now = new Date() }) {
      const must = ({ data, error }) => {
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return data ?? [];
      };
      let q = client
        .from('briefings')
        .select('*')
        .in('status', ELIGIBLE_STATUSES)
        .not('tier', 'is', null)
        .not('briefing_type', 'is', null)
        .in('briefing_type', LANE_TYPES[lane])
        .order('id', { ascending: true })
        .limit(PROFILE_FETCH_MAX);
      q = lane === 'companies' ? q.not('company_id', 'is', null) : q.is('company_id', null).not('institution_id', 'is', null);
      const rows = must(await q).filter((b) => isEligible(b) && matchesLane(b, lane));
      if (lane === 'companies') {
        const rollup = new Map();
        const uids = [...new Set(rows.map((b) => b.company_id).filter(Boolean))];
        for (let i = 0; i < uids.length; i += 200) {
          const r = await client.from('company_signal_rollup').select('company_uid, mentions_30d, artifact_count').in('company_uid', uids.slice(i, i + 200));
          if (r.error) {
            if (MISSING_TABLE(r.error)) break; // no rollup ⇒ every company is "missing" and title decides
            throw r.error;
          }
          for (const x of r.data ?? []) rollup.set(x.company_uid, x);
        }
        return { ranked: rankCompanies(rows, rollup), counts: null };
      }
      const instIds = [...new Set(rows.map((b) => b.institution_id).filter(Boolean))];
      const uidByInstitution = new Map();
      for (let i = 0; i < instIds.length; i += 200) {
        for (const x of must(await client.from('institutions').select('institution_uid, company_uid').in('institution_uid', instIds.slice(i, i + 200)))) uidByInstitution.set(x.institution_uid, x.company_uid);
      }
      const uids = [...new Set([...uidByInstitution.values()].filter(Boolean))];
      const window = evidenceWindow({ tier: 'profile' }, now);
      const signals = new Map();
      for (let i = 0; i < uids.length; i += 12) {
        const or = uids.slice(i, i + 12).map((u) => `company_tags.cs.["${u}"]`).join(',');
        for (let from = 0; ; from += PROFILE_FETCH_MAX) {
          const page = must(await client.from('signals').select(COUNT_SIGNAL_COLS).gte('fired_at', window.from.toISOString()).lte('fired_at', window.to.toISOString()).or(or).order('id', { ascending: true }).range(from, from + PROFILE_FETCH_MAX - 1));
          for (const g of page) signals.set(g.id, g);
          if (page.length < PROFILE_FETCH_MAX) break;
        }
      }
      const artIds = [...new Set([...signals.values()].map((g) => g.artifact_id).filter(Boolean))];
      const envelopes = new Map();
      for (let i = 0; i < artIds.length; i += 100) {
        for (const a of must(await client.from('artifacts').select('artifact_id, source_url, published_at, signal_envelope').in('artifact_id', artIds.slice(i, i + 100)))) envelopes.set(a.artifact_id, envelopeOf(a));
      }
      const withArt = [...signals.values()].map((g) => ({ ...g, artifact: envelopes.get(g.artifact_id) ?? null }));
      const counts = groupedInstitutionCounts(rows, uidByInstitution, withArt, now);
      return { ranked: rankInstitutions(rows, counts), counts };
    },
    /** Ids of briefs whose next draft (version + 1) is already staged in briefings_versions. */
    async stagedDraftIds(briefs) {
      const next = new Map(briefs.map((b) => [b.id, Number(b.version ?? 1) + 1]));
      const ids = [...next.keys()];
      const out = new Set();
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await client.from('briefings_versions').select('briefing_id, version').eq('kind', 'draft').in('briefing_id', ids.slice(i, i + 100));
        if (error) throw error;
        for (const v of data ?? []) if (next.get(v.briefing_id) === Number(v.version)) out.add(v.briefing_id);
      }
      return out;
    },
    /** Probe for the BL2-05 column once per run; a missing column is not an error. */
    async hasManuscriptColumn() {
      const { error } = await client.from('briefings_versions').select('manuscript_md').limit(1);
      if (!error) return true;
      if (MISSING_COLUMN(error)) return false;
      throw Object.assign(new Error(error.message), { code: error.code });
    },
    async insertDraftVersion(row) {
      const { data, error } = await client.from('briefings_versions').insert(row).select('id, briefing_id, version').single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data;
    },
    async insertReview(row) {
      const { error } = await client.from('briefing_reviews').insert(row);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
    },
    /** Read-modify-write merge: keys this runner does not own (the review chain's `requeue`) survive. */
    async updateLaneCursor(lane, cursor) {
      const cur = await client.from('briefing_lanes').select('cursor').eq('lane', lane).maybeSingle();
      if (cur.error) {
        if (MISSING_TABLE(cur.error)) return;
        throw cur.error;
      }
      const stored = cur.data?.cursor && typeof cur.data.cursor === 'object' ? cur.data.cursor : {};
      const { error } = await client.from('briefing_lanes').update({ cursor: { ...stored, ...cursor }, updated_at: new Date().toISOString() }).eq('lane', lane);
      if (error && !MISSING_TABLE(error)) throw error;
    },
    async insertHealth(row) {
      const { error } = await client.from('automation_health_log').insert(row);
      if (error) throw error;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Generator wiring (shared across lanes by run-all)
// ---------------------------------------------------------------------------------------------

/** Raw packs held between fetchPack() and generate() (bounded; the oldest is dropped first). */
export const PACK_MEMO_MAX = 256;

/**
 * BL3-05: wrap an evidence source so the pre-draft gate can see a brief's pack and the following
 * generate() reuses the same raw pack instead of fetching it again.
 * fetchPack(brief, { now }) → the EvidencePack buildPack() makes for the brief's tier window (as of
 * the capture time for fixture packs, exactly as generate() does).
 */
export function createEvidenceProbe(source, { max = PACK_MEMO_MAX } = {}) {
  const packs = new Map();
  const evidence = {
    kind: source.kind,
    async fetchRaw(brief, window) {
      if (packs.has(brief.id)) {
        const raw = packs.get(brief.id);
        packs.delete(brief.id);
        return raw;
      }
      return source.fetchRaw(brief, window);
    },
  };
  const fetchPack = async (brief, { now = new Date() } = {}) => {
    let window = evidenceWindow(brief, now);
    const raw = await source.fetchRaw(brief, window);
    const asOf = source.kind === 'fixture' && raw?.captured_at ? new Date(raw.captured_at) : now;
    if (asOf.getTime() !== now.getTime()) window = evidenceWindow(brief, asOf);
    if (packs.size >= max) packs.delete(packs.keys().next().value);
    packs.set(brief.id, raw);
    return buildPack(raw, brief, window);
  };
  return { evidence, fetchPack, held: () => packs.size };
}

/**
 * Build the generate() closure the runner calls: evidence source + shared page counter + polisher
 * + optional --emit writer. Close with closeGenerator() to release Chromium. `generate.fetchPack`
 * (BL3-05) is the pre-draft pack probe sharing the evidence cache, so callers that pass only
 * generator.generate (run-all) get the Profile floor too.
 * @param {{client?: any, evidenceDir?: string|null, render?: boolean, llm?: boolean, emit?: string|null, dryRun?: boolean, now?: () => Date, out?: (s: string) => void}} [opts]
 */
export async function buildGenerator({ client = null, evidenceDir = null, render = true, llm = true, emit = null, dryRun = false, now = () => new Date(), out = (s) => console.log(s) } = {}) {
  const probe = createEvidenceProbe(client ? createSupabaseEvidence(client) : createFixtureEvidence(evidenceDir ?? EVIDENCE_FIXTURES_DIR));
  const evidence = probe.evidence;
  let counter = null;
  if (render) {
    try {
      const { createPageCounter } = await import('../templates/manuscript.mjs');
      counter = await createPageCounter();
    } catch (e) {
      out(`[lane-runner] render check unavailable (${e.message}); drafts will be staged with pages unmeasured`);
    }
  }
  const polisher = llm ? createPolisher() : null;
  if (llm && !polisher) out('[lane-runner] model polish off (no ANTHROPIC_API_KEY); deterministic composition only');
  if (emit) mkdirSync(emit, { recursive: true });
  const generate = async (brief, { now: at = now(), lane } = {}) => {
    const gen = await sourcedGenerate(brief, { evidence, now: at, counter, polisher });
    if (emit) {
      const file = join(emit, `${lane ?? brief.briefing_type}-${slugify(gen.title ?? brief.title)}.md`);
      const header = [
        `<!-- Briefing Library draft · lane ${lane ?? '?'} · tier ${brief.tier} · briefing ${brief.id}`,
        `     generated ${at.toISOString()} by ${CRAWLER_ID} (${evidence.kind} evidence${dryRun ? ', dry run' : ''})`,
        `     measured pages: ${gen.render_checked ? gen.pages : 'unmeasured'} (tier range ${PAGE_RANGE[brief.tier].join('–')}) · sources: ${gen.source_count} · in scope: ${gen.items_in_scope}${gen.thin ? ' · THIN' : ''}${gen.polished ? ' · model-polished' : ' · deterministic'} -->`,
      ].join('\n');
      writeFileSync(file, `${header}\n${gen.manuscript_md}`);
      gen.emitted = file;
    }
    return gen;
  };
  generate.fetchPack = probe.fetchPack;
  return { generate, fetchPack: probe.fetchPack, evidence, counter, polisher, close: async () => counter?.close?.() };
}

export async function closeGenerator(g) {
  await g?.close?.();
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/**
 * Run one lane. Returns a summary; throws only for configuration errors (per-brief errors are caught).
 *
 * BL3-05: on the companies and institutions lanes, candidates come ranked from
 * db.listProfileCandidates() and each one's evidence pack is fetched with `fetchPack` (default:
 * generate.fetchPack, set by buildGenerator) and passed to preDraftGate(lane, pack) before generate().
 * A failed gate skips the brief (nothing generated or written, cursor.skipped updated). Without a
 * pack probe (unit-test stand-ins) the ranked candidates are drafted ungated and the run says so.
 * `census`: measure every eligible Profile of the lane and draft/write nothing.
 * @param {{lane: string, quota?: number, dryRun?: boolean, census?: boolean, db: any, statuslog: any, generate?: any, fetchPack?: any, now?: () => Date, flushEvery?: number, width?: number, out?: (s: string) => void}} opts
 */
export async function runLane({ lane, quota = undefined, dryRun = false, census = false, db, statuslog, generate, fetchPack = undefined, now = () => new Date(), flushEvery = DEFAULT_FLUSH_EVERY, width = DEFAULT_WIDTH, out = (s) => console.log(s) }) {
  if (!LANES.includes(lane)) throw new Error(`unknown lane "${lane}"`);
  if (typeof generate !== 'function') throw new Error('runLane needs a generate() function (see buildGenerator)');
  const profileMode = isProfileLane(lane);
  if (census && !profileMode) throw new Error('census applies to the companies and institutions lanes only');
  if (census) dryRun = true;
  const probe = typeof fetchPack === 'function' ? fetchPack : typeof generate.fetchPack === 'function' ? generate.fetchPack : null;
  const startedAt = now();
  const laneRow = await db.getLane(lane);

  if (laneRow === undefined && quota === undefined && !census) {
    throw new Error('briefing_lanes does not exist yet (BL2-01 / FDY-277 not applied); pass --quota N to run without it');
  }
  if (laneRow === null && quota === undefined && !census) {
    throw new Error(`briefing_lanes has no row for lane "${lane}"; pass --quota N to run without it`);
  }

  /** @type {any} */
  const summary = {
    lane,
    job: `${JOB_PREFIX}${lane}`,
    dry_run: dryRun,
    quota: quota ?? laneRow?.daily_quota ?? 0,
    cursor_in: laneRow?.cursor ?? null,
    cursor_out: laneRow?.cursor ?? null,
    found: 0,
    drafted: 0,
    duplicates: 0,
    failed: 0,
    in_range: 0,
    out_of_range: 0,
    unmeasured: 0,
    thin: 0,
    polished: 0,
    blocked: null,
    manuscript_column: null,
    lines: [],
    errors: [],
    drafts: [],
  };
  if (profileMode) Object.assign(summary, { floor: PROFILE_FLOOR, skipped_briefs: 0, skips: [], measured: [], clears_floor: 0, fetched: 0, fetch_budget: null, already_staged: 0, recently_skipped: 0, requeue_pending: [], gated: Boolean(probe) });

  const finish = async () => {
    const completedAt = now();
    const health = {
      auto_id: AUTO_ID,
      crawler_id: CRAWLER_ID,
      run_started_at: startedAt.toISOString(),
      run_completed_at: completedAt.toISOString(),
      artifacts_found: summary.found,
      artifacts_new: summary.drafted,
      artifacts_duped: summary.duplicates,
      errors: summary.errors,
      success: summary.errors.length === 0,
      notes: `${summary.job} quota=${summary.quota} dry_run=${dryRun} in_range=${summary.in_range} out_of_range=${summary.out_of_range} thin=${summary.thin}${summary.skipped_briefs ? ` skipped_thin=${summary.skipped_briefs}` : ''}${profileMode ? ` packs=${summary.fetched}` : ''}${summary.blocked ? ` blocked: ${summary.blocked}` : ''}`,
    };
    const r = await statuslog.flush();
    summary.lines.push(...r.lines);
    if (!dryRun) await db.insertHealth(health);
    else out(`[lane-runner dry-run] would write automation_health_log ${JSON.stringify(health)}`);
    return summary;
  };

  if (laneRow?.blocked_reason) {
    summary.blocked = laneRow.blocked_reason;
    out(`[lane-runner] lane "${lane}" is blocked: ${laneRow.blocked_reason}; nothing selected`);
    return finish();
  }
  if (!census && !(Number.isInteger(summary.quota) && summary.quota > 0)) {
    throw new Error(`quota for lane "${lane}" is ${summary.quota}; set briefing_lanes.daily_quota or pass --quota`);
  }

  let sinceFlush = 0;
  const flushIfDue = async (force = false) => {
    if (force || sinceFlush >= flushEvery) {
      const r = await statuslog.flush();
      summary.lines.push(...r.lines);
      sinceFlush = 0;
    }
  };

  let candidates;
  /** @type {(brief: any, outcome: 'staged'|'duplicate'|'failed'|'skipped', gate?: any) => Promise<void>} */
  let onDone;
  /** Pre-draft gate (Profile lanes with a pack probe): async (brief) => null | { ok:false, reason, n }. */
  let gate = null;
  const recordSkip = (brief, v, extra = {}) => {
    summary.skipped_briefs += 1;
    const line = `${String(brief.id).slice(0, 8)} · ${lane} · "${brief.title}" · ${v.reason} · ${v.n} sourced Signals${extra.requeue ? ' · requeue entry kept' : ''}${extra.cached ? ` · checked ${String(extra.cached).slice(0, 10)}` : ''}`;
    summary.skips.push({ briefing_id: brief.id, title: brief.title, reason: v.reason, n: v.n, line, ...extra });
    out(`[lane-runner] ${line}`);
  };

  if (!profileMode) {
    const afterId = laneRow?.cursor?.last_id ?? null;
    candidates = await db.listCandidates({ lane, afterId, limit: summary.quota });
    summary.found = candidates.length;

    if (!candidates.length && afterId) {
      // Exhausted this pass through the lane: wrap so the next run starts from the top.
      summary.cursor_out = { last_id: null, last_run_at: now().toISOString(), note: 'exhausted; wrapped to start' };
      if (!dryRun) await db.updateLaneCursor(lane, summary.cursor_out);
      out(`[lane-runner] lane "${lane}" exhausted after ${afterId}; cursor reset`);
      return finish();
    }

    // Cursor: checkpoint after every brief, but only ever advance to the last id for which every
    // earlier candidate in this run has also finished (the --width window completes out of order).
    const done = new Set();
    onDone = async (brief) => {
      done.add(brief.id);
      let last = null;
      for (const b of candidates) {
        if (!done.has(b.id)) break;
        last = b.id;
      }
      if (!last || summary.cursor_out?.last_id === last) return;
      summary.cursor_out = { last_id: last, last_run_at: now().toISOString() };
      if (!dryRun) await db.updateLaneCursor(lane, summary.cursor_out);
    };
  } else {
    const cursorIn = laneRow?.cursor && typeof laneRow.cursor === 'object' ? laneRow.cursor : {};
    let skipped = readSkipped(cursorIn);
    const fresh = new Map(freshSkipped(skipped, now()).map((e) => [e.id, e]));
    const { ranked } = await db.listProfileCandidates({ lane, now: now() });
    const staged = census ? new Set() : await db.stagedDraftIds(ranked);
    candidates = census ? ranked : ranked.filter((b) => !staged.has(b.id) && !fresh.has(String(b.id)));
    summary.found = candidates.length;
    summary.already_staged = staged.size;
    summary.recently_skipped = ranked.filter((b) => fresh.has(String(b.id))).length;
    summary.fetch_budget = census ? null : FETCH_FACTOR * summary.quota;
    if (!probe) out(`[lane-runner] lane "${lane}": no evidence-pack probe; drafting ranked candidates WITHOUT the ${PROFILE_FLOOR}-Signal pre-draft gate`);

    // Merge-only cursor writes: { skipped, last_run_at } over whatever is stored (requeue survives).
    const checkpoint = async () => {
      const patch = { skipped, last_run_at: now().toISOString() };
      summary.cursor_out = { ...cursorIn, ...(summary.cursor_out && typeof summary.cursor_out === 'object' ? summary.cursor_out : {}), ...patch };
      if (!dryRun) await db.updateLaneCursor(lane, patch);
    };

    const measure = async (brief) => {
      summary.fetched += 1;
      const pack = await probe(brief, { now: now(), lane });
      const v = preDraftGate(lane, pack);
      summary.measured.push({ briefing_id: brief.id, title: brief.title, n: v.n, ok: v.ok });
      if (v.ok) summary.clears_floor += 1;
      return v;
    };

    if (census) {
      for (let i = 0; i < candidates.length; i += width) {
        await Promise.all(
          candidates.slice(i, i + width).map(async (brief) => {
            if (!probe) return;
            try {
              await measure(brief);
            } catch (e) {
              summary.failed += 1;
              summary.errors.push({ briefing_id: brief.id, message: `evidence: ${String(e?.message ?? e)}` });
            }
          }),
        );
      }
      const order = new Map(candidates.map((b, i) => [b.id, i]));
      summary.measured.sort((a, b) => order.get(a.briefing_id) - order.get(b.briefing_id));
      out(`[lane-runner census] lane "${lane}": ${summary.clears_floor} of ${summary.measured.length} measured Profiles clear the ${PROFILE_FLOOR}-Signal floor (${candidates.length} eligible)`);
      for (const m of summary.measured) out(`[lane-runner census]   ${m.ok ? 'CLEARS' : 'thin  '} ${String(m.n).padStart(3)}  ${String(m.briefing_id).slice(0, 8)}  ${m.title}`);
      return finish();
    }

    // Requeue entries (BL2-06 review chain) on this lane: a thin Profile resolves to the thin skip in
    // the summary; the entry itself is never deleted (the cursor write merges around it).
    const requeue = Array.isArray(cursorIn.requeue) ? cursorIn.requeue : [];
    let touched = false;
    for (const entry of requeue) {
      const brief = ranked.find((b) => String(b.id) === String(entry?.briefing_id));
      if (!brief || summary.skips.some((k) => k.briefing_id === brief.id)) continue;
      const cached = fresh.get(String(brief.id));
      if (cached) {
        recordSkip(brief, { reason: THIN_SKIP, n: cached.n }, { requeue: true, cached: cached.checked_at });
        continue;
      }
      if (!probe || summary.fetched >= summary.fetch_budget) continue;
      try {
        const v = await measure(brief);
        if (v.ok) {
          summary.requeue_pending.push(brief.id);
          if (skipped.some((e) => e.id === String(brief.id))) {
            skipped = dropSkipped(skipped, brief.id);
            touched = true;
          }
        } else {
          recordSkip(brief, v, { requeue: true });
          skipped = upsertSkipped(skipped, { id: brief.id, n: v.n, checked_at: now().toISOString() });
          touched = true;
        }
      } catch (e) {
        summary.failed += 1;
        summary.errors.push({ briefing_id: brief.id, message: `evidence: ${String(e?.message ?? e)}` });
      }
    }
    if (touched) await checkpoint();
    const requeued = new Set(requeue.map((e) => String(e?.briefing_id)));
    candidates = candidates.filter((b) => !requeued.has(String(b.id)));

    // The pre-draft gate, run inside draftOne() before generate().
    if (probe && isGatedLane(lane)) {
      gate = async (brief) => {
        const v = await measure(brief);
        if (v.ok) {
          if (skipped.some((e) => e.id === String(brief.id))) skipped = dropSkipped(skipped, brief.id); // stale entry re-checked: clears now
          return null;
        }
        return v;
      };
    }
    onDone = async (brief, outcome, v) => {
      if (outcome === 'skipped') skipped = upsertSkipped(skipped, { id: brief.id, n: v.n, checked_at: now().toISOString() });
      if (outcome === 'failed') return;
      await checkpoint();
    };
  }

  summary.manuscript_column = typeof db.hasManuscriptColumn === 'function' ? await db.hasManuscriptColumn() : true;
  if (!summary.manuscript_column) out('[lane-runner] briefings_versions.manuscript_md not present (BL2-05 migration unapplied); storing the manuscript as contents[0]');

  /** @returns {Promise<{outcome: 'staged'|'duplicate'|'failed'|'skipped', verdict?: any}>} */
  const draftOne = async (brief) => {
    const base = { briefing_id: brief.id, lane, tier: brief.tier, gate: 'DRAFTED' };
    const version = Number(brief.version ?? 1) + 1;
    try {
      if (gate) {
        const v = await gate(brief);
        if (v) {
          recordSkip(brief, v);
          return { outcome: 'skipped', verdict: v };
        }
      }
      const gen = await generate(brief, { now: now(), lane });
      const row = buildDraftRow(brief, gen, lane, { manuscriptColumn: summary.manuscript_column });
      if (!dryRun) await db.insertDraftVersion(row);
      summary.drafted += 1;
      if (gen.polished) summary.polished += 1;
      statuslog.log({ ...base, result: 'PASS', sentence: draftedSentence(brief, gen, row.version) });
      const blockers = [];
      if (gen.render_checked) {
        if (gen.in_range) summary.in_range += 1;
        else {
          summary.out_of_range += 1;
          const [lo, hi] = gen.page_range ?? PAGE_RANGE[brief.tier];
          statuslog.log({ ...base, gate: 'G1-AUTO', result: 'FAIL', sentence: `Page count ${gen.pages} outside the ${brief.tier} range ${lo}–${hi}; draft v${row.version} staged for review.` });
          blockers.push({ code: 'page_range', pages: gen.pages, range: [lo, hi] });
        }
      } else summary.unmeasured += 1;
      if (gen.thin) {
        summary.thin += 1;
        statuslog.log({ ...base, gate: 'G1-AUTO', result: 'FAIL', sentence: `Thin record: ${gen.signal_count} sourced Signals (< ${gen.thin_below}); draft v${row.version} staged and flagged thin.` });
        blockers.push({ code: 'thin', signals: gen.signal_count, floor: gen.thin_below });
      }
      if (blockers.length) {
        const review = buildReviewRow(brief, row.version, blockers, `${CRAWLER_ID} automatic G1 blockers`);
        if (!dryRun) await db.insertReview(review);
        else out(`[lane-runner dry-run] would write briefing_reviews ${JSON.stringify(review)}`);
      }
      summary.drafts.push({ briefing_id: brief.id, title: brief.title, tier: brief.tier, version: row.version, pages: gen.pages, in_range: gen.in_range, sources: gen.source_count, thin: gen.thin, polished: gen.polished, emitted: gen.emitted ?? null });
      return { outcome: 'staged' };
    } catch (e) {
      if (isUniqueViolation(e)) {
        summary.duplicates += 1;
        statuslog.log({ ...base, result: 'FAIL', sentence: `Draft v${version} already staged for "${brief.title}"; nothing written.` });
        return { outcome: 'duplicate' };
      }
      summary.failed += 1;
      summary.errors.push({ briefing_id: brief.id, message: String(e?.message ?? e) });
      statuslog.log({ ...base, result: 'FAIL', sentence: `Drafting failed: ${String(e?.message ?? e)}` });
      return { outcome: 'failed' };
    }
  };

  const processOne = async (brief) => {
    const { outcome, verdict } = await draftOne(brief);
    await onDone(brief, outcome, verdict);
    sinceFlush += 1;
    await flushIfDue();
  };

  if (!profileMode) {
    for (let i = 0; i < candidates.length; i += width) {
      await Promise.all(candidates.slice(i, i + width).map(processOne));
    }
  } else {
    // Ranked order; quota counts STAGED drafts only; at most FETCH_FACTOR × quota packs per run.
    // Each window is capped at the drafts still owed and the packs still allowed.
    const budgetLeft = () => (gate ? summary.fetch_budget - summary.fetched : Infinity);
    let i = 0;
    while (i < candidates.length && summary.drafted < summary.quota && budgetLeft() > 0) {
      const take = Math.max(1, Math.min(width, summary.quota - summary.drafted, budgetLeft()));
      const batch = candidates.slice(i, i + take);
      i += batch.length;
      await Promise.all(batch.map(processOne));
    }
    if (gate && budgetLeft() <= 0 && summary.drafted < summary.quota) out(`[lane-runner] lane "${lane}": evidence-pack budget (${summary.fetch_budget}) spent with ${summary.drafted}/${summary.quota} staged`);
  }
  return finish();
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

async function main(argv) {
  const args = parseArgs(argv);
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let db;
  let client = null;
  if (args.fixtures || (args.dryRun && !(url && key))) {
    const dir = args.fixtures ?? FIXTURES_DIR;
    db = createFixtureDb(loadFixtures(dir));
    console.log(`[lane-runner] using local fixtures from ${dir}`);
  } else {
    if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set');
    assertServiceRole(key);
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(url, key, { auth: { persistSession: false } });
    db = createSupabaseDb(client);
  }

  const generator = await buildGenerator({ client, evidenceDir: args.evidence ?? (db.kind === 'fixture' ? EVIDENCE_FIXTURES_DIR : null), render: args.render, llm: args.llm, emit: args.emit, dryRun: args.dryRun });
  try {
    const statuslog = createStatusLog({ dryRun: args.dryRun });
    const summary = await runLane({ lane: args.lane, quota: args.quota, dryRun: args.dryRun, census: args.census, db, statuslog, generate: generator.generate, flushEvery: args.flushEvery, width: args.width });
    if (db.kind === 'fixture' && !args.dryRun) {
      console.log(`[lane-runner] fixture writes: ${db.writes.versions.length} version rows, ${db.writes.reviews.length} review rows, ${db.writes.cursors.length} cursor updates, ${db.writes.health.length} health rows (in memory only)`);
    }
    const { lines, ...rest } = summary;
    console.log(JSON.stringify(rest, null, 2));
    if (summary.errors.length) process.exitCode = 1;
  } finally {
    await closeGenerator(generator);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`[lane-runner] ${e.message}`);
    process.exit(2);
  });
}
