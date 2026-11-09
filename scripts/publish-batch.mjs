// BL2-07 (FDY-283): publish batch — promote and publish every staged draft Myke has signed off.
//
//   node scripts/publish-batch.mjs [--apply] [--limit N] [--briefing <uuid>] [--fixtures <dir>]
//
// Reads public.v_briefing_signoff_queue (migration 20261109150000) for rows with approved = true —
// a row in public.briefing_signoff for that exact (briefing_id, version). For each one, in order:
//   1. briefings_version_promote(briefing_id, version)  — snapshots the live row (kind='snapshot',
//      job='promote') and copies the staged draft onto it; the row's version becomes the draft's.
//   2. update briefings set status='published', published_at=now() where id = $1 and version = $2
//      — the version guard means the status flip only lands on the row promote just wrote.
//   3. one status-log line: … · <lane> · <tier> · PUBLISHED · PUBLISHED · <sentence>
// Then one automation_health_log row for the run.
//
// Safety
//   - DRY RUN BY DEFAULT. Without --apply nothing is written anywhere: no RPC, no UPDATE, no Notion
//     line, no health row. Every action that would be taken is printed.
//   - Service role only: SUPABASE_SERVICE_ROLE_KEY must be a JWT whose `role` is service_role,
//     otherwise the batch refuses to start (the queue view and sign-off table are deny-all RLS).
//   - Per-brief try/catch: a failing promote never stops the batch; failures land in the health
//     row's errors[] and as a FAIL line on the status page, and the process exits 1.
//   - Idempotent: a promoted row leaves the queue (its version is no longer ahead of the live row),
//     so a second --apply finds nothing. A brief whose draft vanished fails loudly, writes nothing.
//   - The sign-off itself is never written here. Myke inserts into briefing_signoff; this reads it.
//
// Dependencies: v_briefing_signoff_queue + briefing_signoff (BL2-07 migration) and
// briefings_version_promote (BL-10 / BL2-01). Without the view the batch stops with a clear message.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStatusLog } from './statuslog.mjs';
import { assertServiceRole, LANE_TYPES } from './lanes/run.mjs';

export const CRAWLER_ID = 'briefing-publish-batch_v0.1';
// Provisional until the Automation Registry grants an id (do NOT self-assign a number).
export const AUTO_ID = 'AUTO-PROVISIONAL';
export const QUEUE_VIEW = 'v_briefing_signoff_queue';
export const MIGRATION = '20261109150000_bl2_07_briefing_signoff';
export const DEFAULT_LIMIT = 50;

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = join(HERE, 'lanes', 'fixtures');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const out = { apply: false, limit: DEFAULT_LIMIT, briefing: undefined, fixtures: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--briefing') out.briefing = argv[++i];
    else if (a === '--fixtures') out.fixtures = argv[++i] ?? FIXTURES_DIR;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!(Number.isInteger(out.limit) && out.limit > 0)) throw new Error('--limit must be a positive integer');
  if (out.briefing !== undefined && !UUID.test(out.briefing)) throw new Error('--briefing must be a uuid');
  return out;
}

/** The lane a queue row belongs to: from its job ('lane-<lane>') when present, else from its type. */
export function laneFor(row) {
  const m = /^lane-([a-z]+)$/.exec(row?.job ?? '');
  if (m) return m[1];
  const type = row?.briefing_type;
  if (type === 'jurisdiction') return /^US-[A-Z]{2}$/.test(row?.jurisdiction_id ?? '') ? 'states' : 'countries';
  if (type === 'company') return row?.company_id ? 'companies' : 'institutions';
  return Object.keys(LANE_TYPES).find((lane) => LANE_TYPES[lane].includes(type)) ?? 'unknown';
}

/** Only approved rows, oldest staged first, optionally one briefing, capped at limit. */
export function selectApproved(rows, { briefing = undefined, limit = DEFAULT_LIMIT } = {}) {
  return rows
    .filter((r) => r?.approved === true && Number.isInteger(r.version) && r.version >= 1)
    .filter((r) => (briefing ? String(r.briefing_id).toLowerCase() === briefing.toLowerCase() : true))
    .sort((a, b) => String(a.staged_at ?? '').localeCompare(String(b.staged_at ?? '')) || String(a.briefing_id).localeCompare(String(b.briefing_id)))
    .slice(0, limit);
}

export const isMissingView = (e) => e?.code === 'PGRST205' || e?.code === '42P01' || /v_briefing_signoff_queue.*(not exist|not find|schema cache)/i.test(e?.message ?? '');

// ---------------------------------------------------------------------------------------------
// Data access — two implementations of one interface
// ---------------------------------------------------------------------------------------------

/**
 * In-memory db from fixtures. `queue` rows mirror v_briefing_signoff_queue; `briefings` mirror the
 * live table (id, version, status, published_at). Writes are recorded, never sent anywhere.
 */
export function createFixtureDb({ queue = [], briefings = [] } = {}) {
  const live = new Map(briefings.map((b) => [b.id, { ...b }]));
  /** @type {{promotes: any[], publishes: any[], health: any[]}} */
  const writes = { promotes: [], publishes: [], health: [] };
  return {
    kind: 'fixture',
    writes,
    live,
    async listApproved() {
      // The real view drops a row once the live version reaches it; mirror that.
      return queue.filter((q) => q.approved === true && (live.get(q.briefing_id)?.version ?? 0) < q.version);
    },
    async promote(briefingId, version) {
      const row = live.get(briefingId);
      if (!row) throw new Error(`no staged draft ${version} for briefing ${briefingId}`);
      if (row.fail_promote) throw new Error(`no staged draft ${version} for briefing ${briefingId}`);
      writes.promotes.push({ briefingId, version });
      row.version = version;
    },
    async publish(briefingId, version, publishedAt) {
      const row = live.get(briefingId);
      if (!row || row.version !== version) return 0;
      row.status = 'published';
      row.published_at = publishedAt;
      writes.publishes.push({ briefingId, version, publishedAt });
      return 1;
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
  return { queue: read('signoff_queue.json'), briefings: read('briefings.json') };
}

/** Supabase-backed db over a service-role client. */
export function createSupabaseDb(client) {
  return {
    kind: 'supabase',
    async listApproved() {
      const { data, error } = await client.from(QUEUE_VIEW).select('*').eq('approved', true).order('staged_at', { ascending: true });
      if (error) {
        if (isMissingView(error)) throw new Error(`${QUEUE_VIEW} does not exist: migration ${MIGRATION} is not applied (merge of the BL2-07 PR is the approval to apply it)`);
        throw Object.assign(new Error(error.message), { code: error.code });
      }
      return data ?? [];
    },
    async promote(briefingId, version) {
      const { error } = await client.rpc('briefings_version_promote', { p_briefing: briefingId, p_version: version });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
    },
    async publish(briefingId, version, publishedAt) {
      const { data, error } = await client
        .from('briefings')
        .update({ status: 'published', published_at: publishedAt })
        .eq('id', briefingId)
        .eq('version', version)
        .select('id');
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data?.length ?? 0;
    },
    async insertHealth(row) {
      const { error } = await client.from('automation_health_log').insert(row);
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------------------------

/**
 * Promote + publish every approved row. Returns a summary; throws only for configuration errors
 * (per-brief errors are caught and counted).
 * @param {{apply?: boolean, limit?: number, briefing?: string, db: any, statuslog: any, now?: () => Date, out?: (s: string) => void}} opts
 */
export async function runPublishBatch({ apply = false, limit = DEFAULT_LIMIT, briefing = undefined, db, statuslog, now = () => new Date(), out = (s) => console.log(s) }) {
  const startedAt = now();
  const rows = selectApproved(await db.listApproved(), { briefing, limit });
  const mode = apply ? 'APPLY' : 'DRY RUN';

  /** @type {any} */
  const summary = { mode, apply, found: rows.length, published: 0, failed: 0, briefs: [], errors: [], lines: [] };

  if (!rows.length) out(`[publish-batch ${mode}] nothing approved in ${QUEUE_VIEW}${briefing ? ` for ${briefing}` : ''}; nothing to do`);

  for (const row of rows) {
    const lane = laneFor(row);
    const tier = row.tier ?? 'untiered';
    const base = { briefing_id: row.briefing_id, lane, tier, gate: 'PUBLISHED' };
    const label = `"${row.title}" v${row.version} (live v${row.current_version}, ${row.current_status}; signed ${row.signed_by ?? '?'} ${row.signed_at ?? ''})`;
    if (!apply) {
      out(`[publish-batch DRY RUN] would promote + publish ${row.briefing_id} ${label}`);
      summary.briefs.push({ briefing_id: row.briefing_id, version: row.version, title: row.title, action: 'would-publish' });
      continue;
    }
    try {
      await db.promote(row.briefing_id, row.version);
      const publishedAt = now().toISOString();
      const n = await db.publish(row.briefing_id, row.version, publishedAt);
      if (n !== 1) throw new Error(`promote succeeded but the live row is not at v${row.version}; status left unchanged (${n} rows matched)`);
      summary.published += 1;
      summary.briefs.push({ briefing_id: row.briefing_id, version: row.version, title: row.title, action: 'published', published_at: publishedAt });
      const line = statuslog.log({ ...base, result: 'PUBLISHED', sentence: `Published v${row.version} of "${row.title}" (promoted from staged draft; signed off by ${row.signed_by ?? 'Myke'}).` });
      out(`[publish-batch APPLY] ${line}`);
    } catch (e) {
      summary.failed += 1;
      const message = String(e?.message ?? e);
      summary.errors.push({ briefing_id: row.briefing_id, version: row.version, message });
      summary.briefs.push({ briefing_id: row.briefing_id, version: row.version, title: row.title, action: 'failed', message });
      statuslog.log({ ...base, result: 'FAIL', sentence: `Publish of v${row.version} failed: ${message}` });
      out(`[publish-batch APPLY] FAIL ${row.briefing_id} v${row.version}: ${message}`);
    }
  }

  const r = await statuslog.flush();
  summary.lines.push(...r.lines);

  const health = {
    auto_id: AUTO_ID,
    crawler_id: CRAWLER_ID,
    run_started_at: startedAt.toISOString(),
    run_completed_at: now().toISOString(),
    artifacts_found: summary.found,
    artifacts_new: summary.published,
    artifacts_duped: 0,
    errors: summary.errors,
    success: summary.errors.length === 0,
    notes: `publish-batch ${mode} limit=${limit}${briefing ? ` briefing=${briefing}` : ''}`,
  };
  if (apply) await db.insertHealth(health);
  else out(`[publish-batch DRY RUN] would write automation_health_log ${JSON.stringify(health)}`);
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
  if (args.fixtures || (!args.apply && !(url && key))) {
    const dir = args.fixtures ?? FIXTURES_DIR;
    db = createFixtureDb(loadFixtures(dir));
    console.log(`[publish-batch] using local fixtures from ${dir}`);
  } else {
    if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set');
    assertServiceRole(key);
    const { createClient } = await import('@supabase/supabase-js');
    db = createSupabaseDb(createClient(url, key, { auth: { persistSession: false } }));
  }

  // Dry run never sends a Notion line even when NOTION_TOKEN is present.
  const statuslog = createStatusLog({ dryRun: !args.apply });
  const summary = await runPublishBatch({ apply: args.apply, limit: args.limit, briefing: args.briefing, db, statuslog });

  if (db.kind === 'fixture' && args.apply) {
    console.log(`[publish-batch] fixture writes: ${db.writes.promotes.length} promotes, ${db.writes.publishes.length} publishes, ${db.writes.health.length} health rows (in memory only)`);
  }
  const { lines, ...rest } = summary;
  console.log(JSON.stringify(rest, null, 2));
  if (!args.apply) console.log('[publish-batch] dry run — nothing was written. Re-run with --apply to promote and publish.');
  if (summary.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`[publish-batch] ${e.message}`);
    process.exit(2);
  });
}
