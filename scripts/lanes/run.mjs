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
// Safety (unchanged): service role only; --dry-run writes nothing anywhere and prints every line;
// per-brief try/catch; cursor checkpointed after every brief (monotonic across the `--width` window).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStatusLog } from '../statuslog.mjs';
import { generate as sourcedGenerate, PAGE_RANGE } from './generate.mjs';
import { createFixtureEvidence, createSupabaseEvidence } from './evidence.mjs';
import { createPolisher } from './llm.mjs';
import { createThesisWriter } from './thesis.mjs';

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
  const out = { lane: undefined, quota: undefined, dryRun: false, fixtures: undefined, evidence: undefined, emit: null, width: DEFAULT_WIDTH, render: true, llm: true, flushEvery: DEFAULT_FLUSH_EVERY };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--lane') out.lane = argv[++i];
    else if (a === '--quota') out.quota = Number(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--fixtures') out.fixtures = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : FIXTURES_DIR;
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

/** In-memory db from fixtures (or any plain objects). Writes are recorded, never sent anywhere. */
export function createFixtureDb({ lanes = [], briefings = [], manuscriptColumn = true } = {}) {
  const laneRows = new Map(lanes.map((l) => [l.lane, { ...l }]));
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
    async updateLaneCursor(lane, cursor) {
      const l = laneRows.get(lane);
      if (l) l.cursor = cursor;
      writes.cursors.push({ lane, cursor });
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
  return { lanes: read('briefing_lanes.json'), briefings: read('briefings.json') };
}

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
    async updateLaneCursor(lane, cursor) {
      const { error } = await client.from('briefing_lanes').update({ cursor, updated_at: new Date().toISOString() }).eq('lane', lane);
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

/**
 * Build the generate() closure the runner calls: evidence source + shared page counter + polisher
 * + optional --emit writer. Close with closeGenerator() to release Chromium.
 */
export async function buildGenerator({ client = null, evidenceDir = null, render = true, llm = true, emit = null, dryRun = false, now = () => new Date(), out = (s) => console.log(s) } = {}) {
  const evidence = client ? createSupabaseEvidence(client) : createFixtureEvidence(evidenceDir ?? EVIDENCE_FIXTURES_DIR);
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
  // BL3-08: Deep/Standard drafts need a verified thesis + Take. Fails closed (no key ⇒ no_thesis, nothing staged);
  // BL3_REQUIRE_THESIS=0 restores deterministic composition (the committed samples use it).
  const thesisWriter = llm ? createThesisWriter() : null;
  const requireThesis = process.env.BL3_REQUIRE_THESIS !== '0';
  if (emit) mkdirSync(emit, { recursive: true });
  const generate = async (brief, { now: at = now(), lane } = {}) => {
    const gen = await sourcedGenerate(brief, { evidence, now: at, counter, polisher, thesisWriter, requireThesis });
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
  return { generate, evidence, counter, polisher, close: async () => counter?.close?.() };
}

export async function closeGenerator(g) {
  await g?.close?.();
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/**
 * Run one lane. Returns a summary; throws only for configuration errors (per-brief errors are caught).
 * @param {{lane: string, quota?: number, dryRun?: boolean, db: any, statuslog: any, generate?: any, now?: () => Date, flushEvery?: number, width?: number, out?: (s: string) => void}} opts
 */
export async function runLane({ lane, quota = undefined, dryRun = false, db, statuslog, generate, now = () => new Date(), flushEvery = DEFAULT_FLUSH_EVERY, width = DEFAULT_WIDTH, out = (s) => console.log(s) }) {
  if (!LANES.includes(lane)) throw new Error(`unknown lane "${lane}"`);
  if (typeof generate !== 'function') throw new Error('runLane needs a generate() function (see buildGenerator)');
  const startedAt = now();
  const laneRow = await db.getLane(lane);

  if (laneRow === undefined && quota === undefined) {
    throw new Error('briefing_lanes does not exist yet (BL2-01 / FDY-277 not applied); pass --quota N to run without it');
  }
  if (laneRow === null && quota === undefined) {
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
    no_thesis: 0,
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
      notes: `${summary.job} quota=${summary.quota} dry_run=${dryRun} in_range=${summary.in_range} out_of_range=${summary.out_of_range} thin=${summary.thin}${summary.blocked ? ` blocked: ${summary.blocked}` : ''}`,
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
  if (!(Number.isInteger(summary.quota) && summary.quota > 0)) {
    throw new Error(`quota for lane "${lane}" is ${summary.quota}; set briefing_lanes.daily_quota or pass --quota`);
  }

  const afterId = laneRow?.cursor?.last_id ?? null;
  const candidates = await db.listCandidates({ lane, afterId, limit: summary.quota });
  summary.found = candidates.length;

  if (!candidates.length && afterId) {
    // Exhausted this pass through the lane: wrap so the next run starts from the top.
    summary.cursor_out = { last_id: null, last_run_at: now().toISOString(), note: 'exhausted; wrapped to start' };
    if (!dryRun) await db.updateLaneCursor(lane, summary.cursor_out);
    out(`[lane-runner] lane "${lane}" exhausted after ${afterId}; cursor reset`);
    return finish();
  }

  summary.manuscript_column = typeof db.hasManuscriptColumn === 'function' ? await db.hasManuscriptColumn() : true;
  if (!summary.manuscript_column) out('[lane-runner] briefings_versions.manuscript_md not present (BL2-05 migration unapplied); storing the manuscript as contents[0]');

  // Cursor: checkpoint after every brief, but only ever advance to the last id for which every
  // earlier candidate in this run has also finished (the --width window completes out of order).
  const done = new Set();
  const checkpoint = async () => {
    let last = null;
    for (const b of candidates) {
      if (!done.has(b.id)) break;
      last = b.id;
    }
    if (!last || summary.cursor_out?.last_id === last) return;
    summary.cursor_out = { last_id: last, last_run_at: now().toISOString() };
    if (!dryRun) await db.updateLaneCursor(lane, summary.cursor_out);
  };

  let sinceFlush = 0;
  const flushIfDue = async (force = false) => {
    if (force || sinceFlush >= flushEvery) {
      const r = await statuslog.flush();
      summary.lines.push(...r.lines);
      sinceFlush = 0;
    }
  };

  const processOne = async (brief) => {
    const base = { briefing_id: brief.id, lane, tier: brief.tier, gate: 'DRAFTED' };
    const version = Number(brief.version ?? 1) + 1;
    try {
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
    } catch (e) {
      if (e?.code === 'no_thesis') {
        // BL3-08: not staged, and not a failure — a draft with no supportable thesis is not padded.
        summary.no_thesis += 1;
        statuslog.log({ ...base, gate: 'G1-AUTO', result: 'FAIL', sentence: `no_thesis: "${brief.title}" not staged (${e.reason}).` });
      } else if (isUniqueViolation(e)) {
        summary.duplicates += 1;
        statuslog.log({ ...base, result: 'FAIL', sentence: `Draft v${version} already staged for "${brief.title}"; nothing written.` });
      } else {
        summary.failed += 1;
        summary.errors.push({ briefing_id: brief.id, message: String(e?.message ?? e) });
        statuslog.log({ ...base, result: 'FAIL', sentence: `Drafting failed: ${String(e?.message ?? e)}` });
      }
    }
    done.add(brief.id);
    await checkpoint();
    sinceFlush += 1;
    await flushIfDue();
  };

  for (let i = 0; i < candidates.length; i += width) {
    await Promise.all(candidates.slice(i, i + width).map(processOne));
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
    const summary = await runLane({ lane: args.lane, quota: args.quota, dryRun: args.dryRun, db, statuslog, generate: generator.generate, flushEvery: args.flushEvery, width: args.width });
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
