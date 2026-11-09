// BL2-04 (FDY-280): lane runner skeleton.
//
//   node scripts/lanes/run.mjs --lane <lane> [--quota N] [--dry-run] [--fixtures <dir>]
//
// For one lane: read briefing_lanes (daily_quota, cursor), select candidate briefings
// (status in planned|draft, tier set, briefing_type set, matching the lane), call generate(brief)
// for each, stage ONE briefings_versions row (kind='draft', status='draft',
// version = briefings.version + 1, job='lane-<lane>') and log "DRAFTED" to the status page.
// The live briefings row is never touched (BL-10 rule). One automation_health_log row per run.
//
// Safety
//   - Service role only: SUPABASE_SERVICE_ROLE_KEY must be a JWT whose `role` is service_role,
//     otherwise the runner refuses to start. (The lane and version tables are deny-all RLS.)
//   - --dry-run writes nothing anywhere (no DB rows, no Notion lines); every line that would be
//     logged is printed instead. Without Supabase env, --dry-run reads scripts/lanes/fixtures/.
//   - Per-brief try/catch: one failing brief never stops the run; failures land in the health
//     row's errors[] and as a FAIL line on the status page.
//   - The cursor is checkpointed after every brief so a killed run resumes where it stopped.
//
// Dependencies: briefing_lanes is created by BL2-01 (FDY-277). Until that migration is applied
// the lane row is absent; pass --quota to run anyway (cursor then starts from the beginning).

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStatusLog } from '../statuslog.mjs';
import { generate as generateStub } from './generate.mjs';

export const LANES = Object.freeze(['theaters', 'domains', 'subdomains', 'companies', 'states', 'countries', 'institutions']);

/** briefing_type values each lane draws from (public vocabulary; 'company'/'jurisdiction' land with BL2-01). */
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
export const CRAWLER_ID = 'briefing-lane-runner_v0.1';
// Provisional until the Automation Registry grants an id (do NOT self-assign a number).
export const AUTO_ID = 'AUTO-PROVISIONAL';
export const DEFAULT_FLUSH_EVERY = 10;

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(HERE, 'fixtures');

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const out = { lane: undefined, quota: undefined, dryRun: false, fixtures: undefined, flushEvery: DEFAULT_FLUSH_EVERY };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--lane') out.lane = argv[++i];
    else if (a === '--quota') out.quota = Number(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--fixtures') out.fixtures = argv[++i] ?? FIXTURES_DIR;
    else if (a === '--flush-every') out.flushEvery = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  if (!out.lane) throw new Error('--lane <lane> is required');
  if (!LANES.includes(out.lane)) throw new Error(`--lane must be one of ${LANES.join('|')}, got "${out.lane}"`);
  if (out.quota !== undefined && !(Number.isInteger(out.quota) && out.quota > 0)) throw new Error('--quota must be a positive integer');
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

export function buildDraftRow(brief, gen, lane) {
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
    contents: gen.contents ?? [],
    last_refreshed: null,
    published_at: null,
    job: `${JOB_PREFIX}${lane}`,
    evidence_from: gen.evidence_from ?? null,
    evidence_to: gen.evidence_to ?? null,
    created_by: CRAWLER_ID,
  };
  // Only carried once BL2-01 has added the column to both tables.
  if (brief.jurisdiction_id !== undefined) row.jurisdiction_id = brief.jurisdiction_id;
  return row;
}

export const isUniqueViolation = (e) => e?.code === '23505' || /duplicate key|unique constraint|briefings_versions_uniq/i.test(e?.message ?? '');

// ---------------------------------------------------------------------------------------------
// Data access — two implementations of one interface
// ---------------------------------------------------------------------------------------------

/** In-memory db from fixtures (or any plain objects). Writes are recorded, never sent anywhere. */
export function createFixtureDb({ lanes = [], briefings = [] } = {}) {
  const laneRows = new Map(lanes.map((l) => [l.lane, { ...l }]));
  /** @type {{versions: any[], cursors: any[], health: any[]}} */
  const writes = { versions: [], cursors: [], health: [] };
  return {
    kind: 'fixture',
    writes,
    async getLane(lane) {
      return laneRows.get(lane) ?? null;
    },
    async listCandidates({ lane, afterId, limit }) {
      return selectCandidates(briefings, { lane, afterId, limit });
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
      if (afterId) q = q.gt('id', afterId);
      const { data, error } = await q;
      if (error) throw error;
      return selectCandidates(data ?? [], { lane, afterId: null, limit });
    },
    async insertDraftVersion(row) {
      const { data, error } = await client.from('briefings_versions').insert(row).select('id, briefing_id, version').single();
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data;
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
// The run
// ---------------------------------------------------------------------------------------------

/**
 * Run one lane. Returns a summary; throws only for configuration errors (per-brief errors are caught).
 * @param {{lane: string, quota?: number, dryRun?: boolean, db: any, statuslog: any, generate?: any, now?: () => Date, flushEvery?: number, out?: (s: string) => void}} opts
 * @returns {Promise<any>}
 */
export async function runLane({ lane, quota = undefined, dryRun = false, db, statuslog, generate = generateStub, now = () => new Date(), flushEvery = DEFAULT_FLUSH_EVERY, out = (s) => console.log(s) }) {
  if (!LANES.includes(lane)) throw new Error(`unknown lane "${lane}"`);
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
    blocked: null,
    lines: [],
    errors: [],
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
      notes: `${summary.job} quota=${summary.quota} dry_run=${dryRun}${summary.blocked ? ` blocked: ${summary.blocked}` : ''}`,
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

  let sinceFlush = 0;
  for (const brief of candidates) {
    const base = { briefing_id: brief.id, lane, tier: brief.tier, gate: 'DRAFTED' };
    try {
      const gen = await generate(brief, { now: now() });
      const row = buildDraftRow(brief, gen, lane);
      if (!dryRun) await db.insertDraftVersion(row);
      summary.drafted += 1;
      statuslog.log({
        ...base,
        result: 'PASS',
        sentence: `Staged draft v${row.version} of "${brief.title}" (${gen.stub ? 'template skeleton, generator stub' : 'generated'}, ${row.source_refs.length} sources, ${row.contents.length} sections).`,
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        summary.duplicates += 1;
        statuslog.log({ ...base, result: 'FAIL', sentence: `Draft v${Number(brief.version ?? 1) + 1} already staged for "${brief.title}"; nothing written.` });
      } else {
        summary.failed += 1;
        summary.errors.push({ briefing_id: brief.id, message: String(e?.message ?? e) });
        statuslog.log({ ...base, result: 'FAIL', sentence: `Drafting failed: ${String(e?.message ?? e)}` });
      }
    }
    summary.cursor_out = { last_id: brief.id, last_run_at: now().toISOString() };
    if (!dryRun) await db.updateLaneCursor(lane, summary.cursor_out);
    sinceFlush += 1;
    if (sinceFlush >= flushEvery) {
      const r = await statuslog.flush();
      summary.lines.push(...r.lines);
      sinceFlush = 0;
    }
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
  if (args.fixtures || (args.dryRun && !(url && key))) {
    const dir = args.fixtures ?? FIXTURES_DIR;
    db = createFixtureDb(loadFixtures(dir));
    console.log(`[lane-runner] using local fixtures from ${dir}`);
  } else {
    if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set');
    assertServiceRole(key);
    const { createClient } = await import('@supabase/supabase-js');
    db = createSupabaseDb(createClient(url, key, { auth: { persistSession: false } }));
  }

  const statuslog = createStatusLog({ dryRun: args.dryRun });
  const summary = await runLane({ lane: args.lane, quota: args.quota, dryRun: args.dryRun, db, statuslog, flushEvery: args.flushEvery });

  if (db.kind === 'fixture' && !args.dryRun) {
    console.log(`[lane-runner] fixture writes: ${db.writes.versions.length} version rows, ${db.writes.cursors.length} cursor updates, ${db.writes.health.length} health rows (in memory only)`);
  }
  const { lines, ...rest } = summary;
  console.log(JSON.stringify(rest, null, 2));
  if (summary.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`[lane-runner] ${e.message}`);
    process.exit(2);
  });
}
