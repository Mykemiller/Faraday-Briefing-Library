// BL2-06 (FDY-282): the review chain — G1-AUTO → G2-PANEL → G3-XCHECK for staged drafts.
//
//   node scripts/review/run.mjs --gate G1|G2|G3|all [--lane <lane>] [--quota N] [--dry-run]
//        [--fixtures <dir>] [--all-gates] [--panel api|import|emit] [--import <dir>]
//        [--emit-prompts <dir>] [--out <dir>] [--emit-reviews <file>]
//
// Reads briefings_versions drafts (kind='draft') that have no briefing_reviews row for the current
// version at the gate in question (and, for G2/G3, whose previous gate PASSed). Writes briefing_reviews
// ONLY — never the live briefings row. A FAIL returns the draft to its lane (briefing_lanes.cursor.requeue
// carries the blockers); two consecutive FAILs at the same gate park it (status-log PARKED + a
// Questions-for-Myke line); a G3 PASS logs QUEUED and the draft appears in v_briefing_signoff_queue
// (docs/ops/signoff-queue.sql). One status-log line per gate per brief (US CT, fixed format).
//
// Safety: service-role key required for live runs (deny-all RLS on every table touched); --dry-run
// writes nothing anywhere and prints every line; without Supabase env, --dry-run reads the fixtures
// in scripts/review/fixtures/ (seven drafts, captured source texts).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createStatusLog } from '../statuslog.mjs';
import { assertServiceRole, LANES } from '../lanes/run.mjs';
import { jurisdictionRecord, entityRecord, decodeEntities, completeSentences, JW_BASE, jwEventDate } from '../lanes/evidence.mjs';
import { runG1, summariseG1, normaliseUrl } from './g1.mjs';
import { measurePages, closeRenderer } from './render.mjs';
import { buildPrompts, pickPreset, panelVerdict, xcheckVerdict, runPanelApi, runXcheckApi, importPanel, importXcheck, importName, DEFAULT_CAST_DIR } from './panel.mjs';

export const GATES = Object.freeze(['G1-AUTO', 'G2-PANEL', 'G3-XCHECK']);
export const GATE_ALIAS = Object.freeze({ G1: 'G1-AUTO', G2: 'G2-PANEL', G3: 'G3-XCHECK', all: 'all' });
export const CRAWLER_ID = 'briefing-review-chain_v0.1';
export const AUTO_ID = 'AUTO-PROVISIONAL'; // registry grant pending — do NOT self-assign a number
export const G1_REVIEWER = 'g1-auto';
export const G3_REVIEWER = 'xcheck-facts+xcheck-voice';
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'library-previews';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(HERE, 'fixtures');

// ---------------------------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const out = { gate: undefined, lane: undefined, quota: undefined, dryRun: false, fixtures: undefined, allGates: false, panel: undefined, importDir: undefined, emitPrompts: undefined, out: undefined, emitReviews: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--gate') out.gate = argv[++i];
    else if (a === '--lane') out.lane = argv[++i];
    else if (a === '--quota') out.quota = Number(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--fixtures') out.fixtures = argv[++i] ?? FIXTURES_DIR;
    else if (a === '--all-gates') out.allGates = true;
    else if (a === '--panel') out.panel = argv[++i];
    else if (a === '--import') out.importDir = argv[++i];
    else if (a === '--emit-prompts') out.emitPrompts = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--emit-reviews') out.emitReviews = argv[++i];
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.gate) throw new Error('--gate G1|G2|G3|all is required');
  if (!(out.gate in GATE_ALIAS)) throw new Error(`--gate must be one of ${Object.keys(GATE_ALIAS).join('|')}, got "${out.gate}"`);
  out.gate = GATE_ALIAS[out.gate];
  if (out.lane !== undefined && !LANES.includes(out.lane)) throw new Error(`--lane must be one of ${LANES.join('|')}, got "${out.lane}"`);
  if (out.quota !== undefined && !(Number.isInteger(out.quota) && out.quota > 0)) throw new Error('--quota must be a positive integer');
  if (out.panel !== undefined && !['api', 'import', 'emit'].includes(out.panel)) throw new Error('--panel must be api|import|emit');
  if (out.panel === 'import' && !out.importDir) throw new Error('--panel import needs --import <dir>');
  if (out.emitPrompts && !out.panel) out.panel = 'emit';
  if (!out.panel) out.panel = out.importDir ? 'import' : 'api';
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pure flow helpers
// ---------------------------------------------------------------------------------------------

export const laneOf = (draft) => String(draft?.job ?? '').replace(/^lane-/, '') || null;

export function gatesToRun(gate) {
  return gate === 'all' ? [...GATES] : [gate];
}

/** Latest review row for (briefing, version, gate). */
export function latestReview(rows, briefingId, version, gate) {
  return rows
    .filter((r) => r.briefing_id === briefingId && r.version === version && r.gate === gate)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}

/** A draft is due at `gate` when it has no row for that gate and (unless forced) the previous gate PASSed. */
export function isDue(draft, gate, rows, { allGates = false } = {}) {
  if (latestReview(rows, draft.briefing_id, draft.version, gate)) return false;
  if (allGates) return true;
  const idx = GATES.indexOf(gate);
  if (idx === 0) return true;
  const prev = latestReview(rows, draft.briefing_id, draft.version, GATES[idx - 1]);
  return prev?.result === 'PASS';
}

/** The most recent attempt at this gate on an earlier version (or an earlier run of this version). */
export function previousAttempt(rows, draft, gate, excludeId = null) {
  return rows
    .filter((r) => r.briefing_id === draft.briefing_id && r.gate === gate && r.id !== excludeId && (r.version < draft.version || r.version === draft.version))
    .sort((a, b) => (b.version - a.version) || String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
}

export function reviewRow({ draft, gate, reviewer, result, score = null, blockers = [], detail = {} }) {
  return {
    briefing_id: draft.briefing_id,
    version: draft.version,
    gate,
    reviewer,
    result: result === 'PARKED' ? 'FAIL' : result, // the column CHECK is PASS|FAIL; PARKED rides in notes.parked
    score,
    blockers,
    notes: JSON.stringify({ ...detail, parked: result === 'PARKED' || undefined, chain: CRAWLER_ID }),
  };
}

export function requeueEntry({ draft, gate, blockers, parked, requiredEdits }) {
  return {
    briefing_id: draft.briefing_id,
    version: draft.version,
    next_version: draft.version + 1,
    gate,
    blockers: blockers.slice(0, 50),
    required_edits: requiredEdits ?? [],
    parked: Boolean(parked),
    requeued_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------
// Data access — fixture and Supabase implementations of one interface
// ---------------------------------------------------------------------------------------------

export function loadFixtures(dir = FIXTURES_DIR) {
  const read = (name, dflt) => {
    const p = join(dir, name);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : dflt;
  };
  return {
    drafts: read('drafts.json', []),
    briefings: read('briefings.json', []),
    lanes: read('briefing_lanes.json', []),
    reviews: read('briefing_reviews.prior.json', []),
    sources: read('sources.json', { sources: {}, records: {} }),
  };
}

export function createFixtureDb(fx) {
  const reviews = [...(fx.reviews ?? [])];
  const lanes = new Map((fx.lanes ?? []).map((l) => [l.lane, { ...l, cursor: l.cursor ?? {} }]));
  const writes = { reviews: [], requeues: [], health: [], uploads: [] };
  const byUrl = fx.sources?.sources ?? {};
  const records = fx.sources?.records ?? {};
  let seq = 0;
  return {
    kind: 'fixture',
    writes,
    async listDrafts({ lane } = {}) {
      return (fx.drafts ?? []).filter((d) => d.kind === 'draft' && (!lane || laneOf(d) === lane)).sort((a, b) => String(a.briefing_id).localeCompare(String(b.briefing_id)));
    },
    async getBriefing(id) {
      return (fx.briefings ?? []).find((b) => b.id === id) ?? null;
    },
    async listReviews() {
      return [...reviews];
    },
    async insertReview(row) {
      const saved = { id: `rev-fixture-${String(++seq).padStart(4, '0')}`, created_at: new Date().toISOString(), ...row };
      reviews.push(saved);
      writes.reviews.push(saved);
      return saved;
    },
    async requeue(lane, entry) {
      const l = lanes.get(lane);
      if (l) {
        const q = Array.isArray(l.cursor.requeue) ? l.cursor.requeue : [];
        l.cursor = { ...l.cursor, requeue: [...q.filter((e) => !(e.briefing_id === entry.briefing_id && e.version === entry.version && e.gate === entry.gate)), entry] };
      }
      writes.requeues.push({ lane, entry });
    },
    async insertHealth(row) {
      writes.health.push(row);
    },
    async uploadPreview() {
      return null;
    },
    resolve(url) {
      const key = normaliseUrl(url);
      const rec = records[url] ?? records[key];
      if (rec) return { resolved: true, kind: rec.kind, id: rec.id, text: rec.text ?? null, title: rec.title ?? null, published_at: rec.published_at ?? null };
      const e = byUrl[url] ?? byUrl[key]; // raw url first: two events can share a page and differ only by fragment
      if (e && e.best_artifact !== undefined) {
        // BL-09 capture shape (artifact bodies + signal framings)
        const framings = (e.signals ?? []).map((s) => s.framing).filter(Boolean);
        const text = [e.best_artifact?.text, ...framings].filter(Boolean).join('\n');
        return { resolved: true, kind: e.best_artifact ? 'artifact' : 'signal', id: e.best_artifact?.id ?? e.signals?.[0]?.id ?? null, text: text || null, title: e.best_artifact?.title ?? null, published_at: e.best_artifact?.published_at ?? null, dates: (e.signals ?? []).map((s) => s.fired_at).filter(Boolean), truncated: Boolean(e.best_artifact?.truncated), artifact_ids: e.artifact_ids ?? [], signal_ids: (e.signals ?? []).map((s) => s.id) };
      }
      if (e) {
        // BL2-05 evidence-pack shape (the record the generator composed from)
        return { resolved: Boolean(e.found ?? e.text), kind: e.kind, id: e.id, artifact_id: e.artifact_id ?? null, text: e.text ?? null, title: e.title ?? null, published_at: e.published_at ?? null, dates: e.dates ?? [] };
      }
      return { resolved: false };
    },
  };
}

const RECORD_TABLES = new Set(['companies', 'institutions', 'signals', 'artifacts']);
const RECORD_PREFIXES = ['jw_', 'jpas_', 'jps_'];

const JURISDICTION_COLS = 'id, name, slug, level, state_abbr, country_code, iso_code, fips_code, current_tier, current_score, jps_trend, last_scored_date, jpas_quality, jpas_quality_tier, jpas_completeness, jpas_completeness_grade, jds_tier, jds_score, iso_rto, is_competitive_market, utility_type, tax_equipment_exemption, tax_electricity_exemption, tax_property_abatement, tax_statute_citation, tax_source_last_verified, population, dim_regulatory, dim_permitting, dim_power, dim_opposition, dim_incentives'; // the generator's own list — never a breakdown column (JW invariant #2)
const JW_URL_RE = new RegExp(`^${JW_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([a-z0-9-]+)(?:#signal-([0-9a-f-]{36}))?$`, 'i');

/** Scalar leaves of a jsonb payload, one per line — the numbers a Jurisdiction Watch event carries. */
function flattenScalars(v, out = [], depth = 0) {
  if (v == null || depth > 4) return out;
  if (Array.isArray(v)) { for (const x of v) flattenScalars(x, out, depth + 1); return out; }
  if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) { if (x == null) continue; if (typeof x === 'object') flattenScalars(x, out, depth + 1); else out.push(`${k}: ${x}`); } return out; }
  out.push(String(v));
  return out;
}

export function createSupabaseDb(client, { briefingResolve = true } = {}) {
  const cache = new Map();
  const maybe = async (q) => { const { data, error } = await q; if (error) throw Object.assign(new Error(error.message), { code: error.code }); return data; };

  // The generator (scripts/lanes/evidence.mjs) composes every sentence from a Faraday record: a
  // signal's framing/faradays_take, an artifact's ENVELOPE SUMMARY (not its body), the Jurisdiction
  // Watch posture record and its jw_signal_events, the companies/institutions row, a Moratorium
  // Nation row. G1 and Reviewer A must therefore be handed that same record text — resolved by the
  // ref's kind + id first, then by url — not a re-fetch of the page. Found on the first live run
  // (FDY-284): every jurisdiction brief failed on its own JW citations, and digest URLs shared by
  // several artifacts resolved to one body only.
  async function resolveHttp(url, ref) {
    const key = normaliseUrl(url);
    const variants = [...new Set([url, key, key.replace(/^https:/, ''), `${key}?utm_source=rss&utm_medium=feed&utm_campaign=rss_campaign`])];
    const arts = (await maybe(client.from('artifacts').select('artifact_id, body_text, raw_content, published_at, signal_envelope').in('source_url', variants).limit(12))) ?? [];
    const sigs = (await maybe(client.from('signals').select('id, artifact_id, framing, faradays_take, fired_at').in('source_url', variants).limit(12))) ?? [];
    // The ref names its record: make sure that record is in the set even when the url on the ref is
    // the artifact's while the signal was captured under a redirect (or vice versa).
    if (ref?.kind === 'signal' && ref.id && !sigs.some((g) => g.id === ref.id)) {
      const g = await maybe(client.from('signals').select('id, artifact_id, framing, faradays_take, fired_at').eq('id', ref.id).maybeSingle());
      if (g) sigs.push(g);
    }
    const wantArtifact = ref?.artifact_id ?? (ref?.kind === 'artifact' ? ref.id : null);
    for (const aid of [...new Set([wantArtifact, ...sigs.map((g) => g.artifact_id)].filter(Boolean))]) {
      if (arts.some((a) => a.artifact_id === aid)) continue;
      const a = await maybe(client.from('artifacts').select('artifact_id, body_text, raw_content, published_at, signal_envelope').eq('artifact_id', aid).maybeSingle());
      if (a) arts.push(a);
    }
    if (!arts.length && !sigs.length) return { resolved: false };
    const texts = [];
    for (const a of arts) texts.push(a.signal_envelope?.title, a.signal_envelope?.headline, a.signal_envelope?.summary, a.body_text, a.raw_content);
    for (const g of sigs) texts.push(g.framing, g.faradays_take);
    const best = arts.slice().sort((a, b) => String(b.body_text ?? b.raw_content ?? '').length - String(a.body_text ?? a.raw_content ?? '').length)[0];
    return {
      resolved: true,
      kind: ref?.kind === 'signal' ? 'signal' : arts.length ? 'artifact' : 'signal',
      id: ref?.id ?? best?.artifact_id ?? sigs[0]?.id,
      text: [...new Set(texts.filter(Boolean).map(String))].join('\n') || null,
      title: ref?.title ?? best?.signal_envelope?.title ?? best?.signal_envelope?.headline ?? null,
      published_at: best?.published_at ?? ref?.published_at ?? null,
      dates: [...arts.map((a) => a.published_at), ...sigs.map((g) => g.fired_at)].filter(Boolean),
      artifact_ids: arts.map((a) => a.artifact_id),
      signal_ids: sigs.map((g) => g.id),
    };
  }

  async function resolveJw(slug, eventId) {
    if (eventId) {
      const e = await maybe(client.from('jw_signal_events').select('*').eq('id', eventId).maybeSingle());
      if (!e) return { resolved: false };
      const text = [
        e.headline ? `${decodeEntities(e.headline).replace(/[.]$/, '')}.` : null,
        e.prior_count != null && e.current_count != null ? `Recorded count ${e.prior_count} → ${e.current_count} for ${e.period_key}${e.pct_change != null ? ` (${Number(e.pct_change).toFixed(0)}%)` : ''}.` : null,
        ...flattenScalars(e.payload),
      ].filter(Boolean).join('\n');
      // BL3-07: the event date the generator prints (payload.observed_at ?? triggered_at), never period_end.
      return { resolved: true, kind: 'jw_event', id: e.id, text, title: e.headline ?? null, published_at: jwEventDate(e), dates: [jwEventDate(e), e.triggered_at].filter(Boolean) };
    }
    const j = await maybe(client.from('jurisdictions').select(JURISDICTION_COLS).eq('slug', slug).maybeSingle());
    if (!j) return { resolved: false };
    j.jps_history = (await maybe(client.from('jps_history').select('scored_at, score, tier, change_reason, scale_version').eq('jurisdiction_id', j.id).order('scored_at', { ascending: false }).limit(12))) ?? [];
    const rec = jurisdictionRecord(j);
    const text = [...rec.text, ...(rec.history ?? []).map((h) => `${h.date ?? ''}: ${h.tier ?? ''} ${h.score ?? ''}${h.reason ? ` — ${h.reason}` : ''}`.trim())].join('\n');
    return { resolved: true, kind: 'record', id: j.id, text, title: rec.title, published_at: rec.published_at, dates: j.jps_history.map((h) => h.scored_at).filter(Boolean) };
  }

  async function resolveEntity(ref) {
    const isInst = /institutions record/i.test(ref?.publisher ?? '') || /institutions record/i.test(ref?.title ?? '');
    if (isInst) {
      const i = await maybe(client.from('institutions').select('institution_uid, canonical_name, aliases, archetype_band, secondary_archetypes, website_url, hq_country, company_uid, jurisdiction_ids, status, license_status, updated_at').eq('institution_uid', ref.id).maybeSingle());
      if (!i) return { resolved: false };
      const c = i.company_uid ? await maybe(client.from('companies').select('company_uid, canonical_name, company_type, ownership_public_private, hq_location_raw, hq_country, ticker, website_url, nvidia_dsx_partner, legal_structure, size_band, business_role, status, updated_at').eq('company_uid', i.company_uid).maybeSingle()) : null;
      const rec = entityRecord({ institution: i, company: c });
      return { resolved: true, kind: 'institution', id: i.institution_uid, text: rec.text.join('\n'), title: rec.title, published_at: rec.published_at };
    }
    const c = await maybe(client.from('companies').select('company_uid, canonical_name, company_type, ownership_public_private, hq_location_raw, hq_country, ticker, website_url, nvidia_dsx_partner, legal_structure, size_band, business_role, status, updated_at').eq('company_uid', ref.id).maybeSingle());
    if (!c) return { resolved: false };
    const rec = entityRecord({ company: c });
    return { resolved: true, kind: 'company', id: c.company_uid, text: rec.text.join('\n'), title: rec.title, published_at: rec.published_at };
  }

  async function resolveMoratorium(ref) {
    const m = await maybe(client.from('moratorium_nation_inventory').select('moratorium_id, jurisdiction_name, jurisdiction_type, date_enacted_iso, duration, legal_basis, trigger_text, current_status, activity_level, enacted_status').eq('moratorium_id', ref.id).maybeSingle());
    if (!m) return { resolved: false };
    const parts = [];
    if (m.current_status) parts.push(...completeSentences(m.current_status));
    if (!parts.length && m.legal_basis) parts.push(`${decodeEntities(m.legal_basis)}.`);
    if (m.trigger_text) parts.push(`Recorded trigger: ${decodeEntities(m.trigger_text).replace(/[.]$/, '')}.`);
    parts.push(...flattenScalars({ duration: m.duration, activity_level: m.activity_level, enacted_status: m.enacted_status, date_enacted_iso: m.date_enacted_iso }));
    return { resolved: true, kind: 'moratorium', id: m.moratorium_id, text: parts.join('\n'), title: `Moratorium Nation inventory — ${m.jurisdiction_name} (${m.moratorium_id})`, published_at: m.date_enacted_iso ?? null, dates: [m.date_enacted_iso].filter(Boolean) };
  }

  async function resolveLive(url, ref = null) {
    const cacheKey = `${ref?.kind ?? ''}:${ref?.id ?? ''}:${url}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    let res = { resolved: false };
    const jw = url.match(JW_URL_RE);
    if (jw) res = await resolveJw(jw[1], jw[2] ?? null);
    else if (ref?.kind === 'record' && ref.id && /^https?:\/\/faraday\.ai\/records\//i.test(url)) res = await resolveEntity(ref);
    else if (ref?.kind === 'moratorium' && ref.id) res = await resolveMoratorium(ref);
    else if (/^https?:\/\//i.test(normaliseUrl(url))) {
      res = await resolveHttp(url, ref);
      if (!res.resolved && ref?.kind === 'record' && ref.id) res = await resolveEntity(ref); // a company cited by its website url
    } else {
      const m = url.match(/^supabase:\/\/[^/]+\/public\.([a-z0-9_]+)\?([a-z0-9_]+)=([^&]+)/i);
      if (m && (RECORD_TABLES.has(m[1]) || RECORD_PREFIXES.some((p) => m[1].startsWith(p)))) {
        const { data } = await client.from(m[1]).select('*').eq(m[2], decodeURIComponent(m[3])).limit(1);
        if (data?.length) res = { resolved: true, kind: m[1].replace(/s$/, ''), id: decodeURIComponent(m[3]), text: JSON.stringify(data[0]) };
      }
    }
    cache.set(cacheKey, res);
    return res;
  }
  return {
    kind: 'supabase',
    async listDrafts({ lane } = {}) {
      let q = client.from('briefings_versions').select('*').eq('kind', 'draft').order('briefing_id', { ascending: true }).order('version', { ascending: false });
      if (lane) q = q.eq('job', `lane-${lane}`);
      const { data, error } = await q;
      if (error) throw error;
      // newest draft version per briefing only
      const seen = new Set();
      return (data ?? []).filter((d) => (seen.has(d.briefing_id) ? false : (seen.add(d.briefing_id), true)));
    },
    async getBriefing(id) {
      const { data, error } = await client.from('briefings').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    async listReviews() {
      const { data, error } = await client.from('briefing_reviews').select('*').order('created_at', { ascending: false }).limit(5000);
      if (error) throw error;
      return data ?? [];
    },
    async insertReview(row) {
      const { data, error } = await client.from('briefing_reviews').insert(row).select('*').single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data;
    },
    async requeue(lane, entry) {
      const { data, error } = await client.from('briefing_lanes').select('cursor').eq('lane', lane).maybeSingle();
      if (error) throw error;
      const cursor = data?.cursor ?? {};
      const q = Array.isArray(cursor.requeue) ? cursor.requeue : [];
      const next = { ...cursor, requeue: [...q.filter((e) => !(e.briefing_id === entry.briefing_id && e.version === entry.version && e.gate === entry.gate)), entry] };
      const { error: e2 } = await client.from('briefing_lanes').update({ cursor: next, updated_at: new Date().toISOString() }).eq('lane', lane);
      if (e2) throw e2;
    },
    async insertHealth(row) {
      const { error } = await client.from('automation_health_log').insert(row);
      if (error) throw error;
    },
    async uploadPreview(localPath, storagePath) {
      const body = readFileSync(localPath);
      const { error } = await client.storage.from(STORAGE_BUCKET).upload(storagePath, body, { contentType: 'application/pdf', upsert: true });
      if (error) throw error;
      return `${STORAGE_BUCKET}/${storagePath}`;
    },
    resolve: null, // async; use resolveAsync
    resolveAsync: briefingResolve ? resolveLive : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------------------------

async function prefetchResolver(db, draft, briefing) {
  if (db.resolve) return db.resolve;
  // Live: resolve every url up front so the gate itself stays synchronous. Keyed on the RAW url —
  // Jurisdiction Watch events share one page and differ only by #signal-<id>, which normaliseUrl strips.
  const map = new Map();
  for (const r of draft.source_refs ?? []) {
    for (const u of [r.url, ...(r.urls ?? []), ...(r.alt_urls ?? [])].filter(Boolean).flatMap((x) => String(x).split(/\s+·\s+/))) {
      const raw = u.trim();
      if (!map.has(raw)) map.set(raw, await db.resolveAsync(raw, r));
      const key = normaliseUrl(raw);
      if (!map.has(key)) map.set(key, map.get(raw));
    }
  }
  if (briefing?.airtable_record_id) map.set(`airtable:${briefing.airtable_record_id}`, { resolved: true, kind: 'briefing_record', text: null });
  return (url) => {
    if (/^airtable:\/\//.test(url) && briefing?.airtable_record_id && url.includes(briefing.airtable_record_id)) return { resolved: true, kind: 'briefing_record', id: briefing.airtable_record_id, text: null };
    return map.get(String(url).trim()) ?? map.get(normaliseUrl(url)) ?? { resolved: false };
  };
}

function wrapResolver(resolve, briefing) {
  return (url, ctx) => {
    if (/^airtable:\/\//.test(url) && briefing?.airtable_record_id && url.includes(briefing.airtable_record_id)) return { resolved: true, kind: 'briefing_record', id: briefing.airtable_record_id, text: null };
    return resolve(url, ctx) ?? { resolved: false };
  };
}

export async function gateG1({ draft, briefing, resolve, outDir, db, dryRun }) {
  const basename = `${String(draft.briefing_id).slice(0, 8)}-v${draft.version}`;
  const measured = await measurePages({ manuscript: draft.manuscript_md ?? draft.contents?.[0] ?? '', tier: draft.tier, outDir, basename });
  let previewPath = measured.pdf_path;
  if (!dryRun && measured.pdf_path && db.kind === 'supabase') {
    try { previewPath = await db.uploadPreview(measured.pdf_path, `review/${draft.briefing_id}/v${draft.version}.pdf`); } catch (e) { measured.upload_error = String(e?.message ?? e); }
  }
  const r = runG1({ draft, briefing, pages: measured.pages, resolve, renderNote: measured.error });
  const detail = { summary: summariseG1(r), stats: r.stats, warnings: r.warnings.slice(0, 40), preview_path: previewPath, html_path: measured.html_path, fonts_loaded: measured.fonts_loaded, render_error: measured.error ?? null, upload_error: measured.upload_error ?? null };
  return { result: r.result, blockers: r.blockers, score: measured.pages, detail, sentence: detail.summary, requiredEdits: [] };
}

export async function gateG2({ draft, resolve, mode, importDir, castDir, model }) {
  const preset = pickPreset(draft);
  let run;
  if (mode === 'import') run = importPanel(draft, importDir);
  else run = await runPanelApi(draft, { resolve, castDir, model });
  if (!run.review) {
    const missing = run.missing ?? [];
    return { result: 'FAIL', reviewer: preset.reviewer, blockers: [{ code: 'panel_incomplete', message: `panel output missing for ${missing.join(', ')}` }], score: null, detail: { preset: preset.key, missing }, sentence: `Panel could not convene: missing ${missing.join(', ')}.`, requiredEdits: [], incomplete: true };
  }
  const v = panelVerdict(run.review);
  const detail = { preset: preset.key, preset_label: preset.label, members: run.members.map((m) => ({ slug: m.slug, scores: { thesis_clear: m.json?.thesis_clear, evidence_sufficient: m.json?.evidence_sufficient, what_to_watch_useful: m.json?.what_to_watch_useful }, could_a_buyer_act: m.json?.could_a_buyer_act, required_edits: (m.json?.required_edits ?? []).length, note: m.json?.note })), chair: run.chair?.slug ?? null, scores: v.scores, could_a_buyer_act: v.could_a_buyer_act, required_edits: v.required_edits, note: v.note, mode };
  const s = v.scores;
  const sentence = v.verdict === 'PASS'
    ? `Panel ${preset.label} passed: thesis ${s.thesis_clear}/5, evidence ${s.evidence_sufficient}/5, watch ${s.what_to_watch_useful}/5; ${v.required_edits.length} non-factual edit${v.required_edits.length === 1 ? '' : 's'}. ${v.note}`.trim()
    : `Panel ${preset.label} failed: thesis ${s.thesis_clear ?? '–'}/5, evidence ${s.evidence_sufficient ?? '–'}/5, watch ${s.what_to_watch_useful ?? '–'}/5; ${v.blockers.filter((b) => b.code === 'factual_edit').length} factual edit${v.blockers.filter((b) => b.code === 'factual_edit').length === 1 ? '' : 's'}. ${v.note}`.trim();
  return { result: v.verdict, reviewer: preset.reviewer, blockers: v.blockers, score: v.min_score, detail, sentence, requiredEdits: v.required_edits };
}

export async function gateG3({ draft, resolve, mode, importDir, castDir, model }) {
  let run;
  if (mode === 'import') run = importXcheck(draft, importDir);
  else run = await runXcheckApi(draft, { resolve, castDir, model });
  if (!run.facts || !run.voice) {
    const missing = run.missing ?? [];
    return { result: 'FAIL', reviewer: G3_REVIEWER, blockers: [{ code: 'xcheck_incomplete', message: `cross-check output missing for ${missing.join(', ')}` }], score: null, detail: { missing }, sentence: `Cross-check incomplete: missing ${missing.join(', ')}.`, requiredEdits: [], incomplete: true };
  }
  const v = xcheckVerdict(run.facts, run.voice);
  const detail = { a: v.a, b: v.b, mismatches: v.mismatches, violations: v.violations, unverifiable: v.unverifiable, numbers_checked: v.numbers_checked, disagreements: v.disagreements, summaries: v.summaries, mode };
  const sentence = v.verdict === 'PASS'
    ? `Both cross-checkers passed: facts ${v.numbers_checked ?? '?'} figures re-derived, 0 mismatches${v.unverifiable ? ` (${v.unverifiable} unverifiable)` : ''}; voice 0 violations.`
    : v.verdict === 'PARKED'
      ? `Reviewers disagree on ${v.disagreements.length} sentence${v.disagreements.length === 1 ? '' : 's'}: ${v.disagreements.map((d) => `"${String(d.sentence).slice(0, 80)}"`).join('; ')}.`
      : `Cross-check failed: facts ${v.a} (${v.mismatches} mismatch${v.mismatches === 1 ? '' : 'es'}), voice ${v.b} (${v.violations} violation${v.violations === 1 ? '' : 's'}).`;
  const edits = [
    ...(run.facts.findings ?? []).filter((f) => f.verdict === 'mismatch').map((f) => ({ kind: 'factual', location: f.sentence, edit: f.claim, reason: f.source_excerpt })),
    ...(run.voice.violations ?? []).map((x) => ({ kind: 'structural', location: x.sentence_or_section, edit: x.rule, reason: x.note })),
  ];
  return { result: v.verdict, reviewer: G3_REVIEWER, blockers: v.blockers, score: null, detail, sentence, requiredEdits: edits };
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/**
 * Run the chain over the due drafts. Returns a summary; throws only for configuration errors.
 * @param {{gate: string, lane?: string|null, quota?: number, dryRun?: boolean, allGates?: boolean, panel?: string, importDir?: string, emitPrompts?: string, outDir?: string, castDir?: string, model?: string, db: any, statuslog: any, now?: () => Date, out?: (s: string) => void}} opts
 */
export async function runChain({ gate, lane, quota, dryRun = false, allGates = false, panel = 'api', importDir, emitPrompts, outDir, castDir = DEFAULT_CAST_DIR, model, db, statuslog, now = () => new Date(), out = (s) => console.log(s) }) {
  const startedAt = now();
  const gates = gatesToRun(gate);
  const summary = { gate, lane: lane ?? null, dry_run: dryRun, panel_mode: panel, considered: 0, reviewed: 0, passed: 0, failed: 0, parked: 0, queued: 0, skipped: 0, rows: [], errors: [], prompts_emitted: 0 };
  const rows = await db.listReviews();
  let drafts = await db.listDrafts({ lane });
  if (quota) drafts = drafts.slice(0, quota);
  summary.considered = drafts.length;
  {
    const prefixes = new Map();
    for (const d of drafts) { const k = `${String(d.briefing_id).slice(0, 8)}-v${d.version}`; if (prefixes.has(k)) throw new Error(`two drafts share the file prefix ${k} (${prefixes.get(k)} and ${d.briefing_id}); import/emit names would collide`); prefixes.set(k, d.briefing_id); }
  }
  const previews = outDir ?? join(tmpdir(), 'bl2-06-review');
  mkdirSync(previews, { recursive: true });

  for (const draft of drafts) {
    const draftLane = laneOf(draft);
    const briefing = (await db.getBriefing(draft.briefing_id)) ?? {};
    const base = { briefing_id: draft.briefing_id, lane: draftLane ?? 'unknown', tier: draft.tier ?? 'unknown' };
    let resolve;
    try {
      resolve = wrapResolver(await prefetchResolver(db, draft, briefing), briefing);
    } catch (e) {
      summary.errors.push({ briefing_id: draft.briefing_id, message: `resolver: ${e.message}` });
      continue;
    }

    if (panel === 'emit' && emitPrompts) {
      const built = buildPrompts(draft, { resolve, castDir });
      mkdirSync(emitPrompts, { recursive: true });
      for (const p of built.prompts) {
        const name = importName(draft, p.role, p.slug).replace(/\.json$/, '.prompt.json');
        writeFileSync(join(emitPrompts, name), JSON.stringify({ briefing_id: draft.briefing_id, version: draft.version, title: draft.title, gate: p.gate, role: p.role, slug: p.slug, reviewer: p.reviewer, preset: built.preset.key, prompt_hash: p.prompt_hash, output_file: importName(draft, p.role, p.slug), system: p.system, user: p.user, schema: p.schema, needs: p.needs ?? [] }, null, 1));
        summary.prompts_emitted += 1;
      }
      out(`[review-chain] emitted ${built.prompts.length} prompts for ${draft.title} (preset ${built.preset.key})`);
      continue;
    }

    let proceed = true;
    for (const g of gates) {
      if (!proceed && !allGates) break;
      if (!isDue(draft, g, rows, { allGates })) { summary.skipped += 1; out(`[review-chain] ${String(draft.briefing_id).slice(0, 8)} v${draft.version} not due at ${g}; skipped`); continue; }
      let res;
      try {
        if (g === 'G1-AUTO') res = { reviewer: G1_REVIEWER, ...(await gateG1({ draft, briefing, resolve, outDir: previews, db, dryRun })) };
        else if (g === 'G2-PANEL') res = await gateG2({ draft, resolve, mode: panel, importDir, castDir, model });
        else res = await gateG3({ draft, resolve, mode: panel, importDir, castDir, model });
      } catch (e) {
        summary.errors.push({ briefing_id: draft.briefing_id, gate: g, message: String(e?.message ?? e) });
        statuslog.log({ ...base, gate: g, result: 'FAIL', sentence: `Gate could not run: ${String(e?.message ?? e)}` });
        proceed = false;
        continue;
      }
      if (res.incomplete) {
        // Not a verdict on the draft — nothing is written, the draft stays due at this gate.
        out(`[review-chain] ${String(draft.briefing_id).slice(0, 8)} v${draft.version} ${g}: ${res.sentence}`);
        summary.errors.push({ briefing_id: draft.briefing_id, gate: g, message: res.sentence });
        proceed = false;
        continue;
      }
      const prior = previousAttempt(rows, draft, g);
      const row = reviewRow({ draft, gate: g, reviewer: res.reviewer, result: res.result, score: res.score, blockers: res.blockers, detail: res.detail });
      const saved = dryRun ? { id: null, created_at: now().toISOString(), ...row } : await db.insertReview(row);
      rows.push(saved);
      summary.reviewed += 1;
      summary.rows.push({ ...saved, lane: draftLane, title: draft.title, tier: draft.tier, status_result: res.result });
      if (dryRun) out(`[review-chain dry-run] would insert briefing_reviews ${JSON.stringify({ briefing_id: row.briefing_id, version: row.version, gate: row.gate, reviewer: row.reviewer, result: row.result, score: row.score, blockers: row.blockers.length })}`);

      if (res.result === 'PASS') {
        summary.passed += 1;
        statuslog.log({ ...base, gate: g, result: 'PASS', sentence: res.sentence });
        if (g === 'G3-XCHECK') {
          summary.queued += 1;
          const g1 = latestReview(rows, draft.briefing_id, draft.version, 'G1-AUTO');
          const g2 = latestReview(rows, draft.briefing_id, draft.version, 'G2-PANEL');
          statuslog.log({ ...base, gate: 'QUEUED', result: 'PASS', sentence: `Queued for sign-off: v${draft.version}, ${g1?.score ?? '?'} pages, panel min score ${g2?.score ?? '?'}/5; see v_briefing_signoff_queue.` });
        }
        continue;
      }
      // FAIL or PARKED
      proceed = false;
      const parkedByGate = res.result === 'PARKED';
      const consecutive = prior?.result === 'FAIL';
      const parked = parkedByGate || consecutive;
      if (parked) summary.parked += 1; else summary.failed += 1;
      statuslog.log({ ...base, gate: g, result: parked ? 'PARKED' : 'FAIL', sentence: parkedByGate ? res.sentence : consecutive ? `Second consecutive FAIL at ${g} (v${prior.version} then v${draft.version}); parked. ${res.sentence}` : res.sentence });
      if (parked) {
        statuslog.question({ issue: 'FDY-282', text: `"${draft.title}" v${draft.version} (${draftLane}) parked at ${g}: ${res.blockers.slice(0, 3).map((b) => b.message).join(' | ').slice(0, 400)}`, default: 'skip this brief this release' });
      }
      const entry = requeueEntry({ draft, gate: g, blockers: res.blockers, parked, requiredEdits: res.requiredEdits });
      if (!dryRun) await db.requeue(draftLane, entry); else out(`[review-chain dry-run] would requeue ${draftLane}: ${JSON.stringify({ briefing_id: entry.briefing_id, version: entry.version, gate: entry.gate, blockers: entry.blockers.length, parked: entry.parked })}`);
    }
    const r = await statuslog.flush();
    summary.lines = [...(summary.lines ?? []), ...r.lines];
  }

  const completedAt = now();
  const health = {
    auto_id: AUTO_ID, crawler_id: CRAWLER_ID, run_started_at: startedAt.toISOString(), run_completed_at: completedAt.toISOString(),
    artifacts_found: summary.considered, artifacts_new: summary.reviewed, artifacts_duped: summary.skipped, errors: summary.errors, success: summary.errors.length === 0,
    notes: `review-chain gate=${gate} lane=${lane ?? 'all'} panel=${panel} dry_run=${dryRun} pass=${summary.passed} fail=${summary.failed} parked=${summary.parked} queued=${summary.queued}`,
  };
  if (!dryRun && panel !== 'emit') await db.insertHealth(health); else out(`[review-chain dry-run] would write automation_health_log ${JSON.stringify(health)}`);
  await closeRenderer();
  return summary;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

async function main(argv) {
  const args = parseArgs(argv);
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let db;
  if (args.fixtures || (args.dryRun && !(url && key))) {
    const dir = args.fixtures ?? FIXTURES_DIR;
    db = createFixtureDb(loadFixtures(dir));
    console.log(`[review-chain] using local fixtures from ${dir}`);
  } else {
    if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set');
    assertServiceRole(key);
    const { createClient } = await import('@supabase/supabase-js');
    db = createSupabaseDb(createClient(url, key, { auth: { persistSession: false } }));
  }
  if (args.panel === 'api' && args.gate !== 'G1-AUTO' && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.warn('[review-chain] no ANTHROPIC_API_KEY: G2/G3 need --panel import <dir> or --panel emit --emit-prompts <dir>');
  }
  const statuslog = createStatusLog({ dryRun: args.dryRun });
  const summary = await runChain({ gate: args.gate, lane: args.lane, quota: args.quota, dryRun: args.dryRun, allGates: args.allGates, panel: args.panel, importDir: args.importDir, emitPrompts: args.emitPrompts, outDir: args.out, db, statuslog });
  if (args.emitReviews) {
    mkdirSync(dirname(args.emitReviews), { recursive: true });
    writeFileSync(args.emitReviews, JSON.stringify(summary.rows, null, 1));
    console.log(`[review-chain] wrote ${summary.rows.length} review rows to ${args.emitReviews}`);
  }
  if (db.kind === 'fixture' && !args.dryRun) console.log(`[review-chain] fixture writes: ${db.writes.reviews.length} review rows, ${db.writes.requeues.length} requeues (in memory only)`);
  const { rows, lines, ...rest } = summary;
  console.log(JSON.stringify(rest, null, 2));
  if (summary.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`[review-chain] ${e.message}`);
    process.exit(2);
  });
}
