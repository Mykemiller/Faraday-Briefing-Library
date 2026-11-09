// BL2-05 (FDY-281): run every lane in parallel.
//
//   node scripts/lanes/run-all.mjs [--dry-run] [--emit <dir>] [--lanes a,b,c] [--quota N] [--width 3]
//                                  [--fixtures [dir]] [--evidence <dir>] [--no-render] [--no-llm]
//
// One worker per lane (7), each drafting its briefs `--width` at a time (default 3), all sharing
// ONE Chromium page counter and ONE model-call semaphore (12 calls in flight across the process —
// GLOBAL_MODEL_SEMAPHORE in llm.mjs). Each lane's daily_quota comes from briefing_lanes unless
// --quota overrides it; each lane checkpoints its own cursor after every brief, so a killed run
// resumes where every lane stopped. Exit code 1 if any lane had a failed brief, 2 on config errors.

import { pathToFileURL } from 'node:url';
import { createStatusLog } from '../statuslog.mjs';
import { LANES, FIXTURES_DIR, EVIDENCE_FIXTURES_DIR, assertServiceRole, createFixtureDb, createSupabaseDb, loadFixtures, runLane, buildGenerator, closeGenerator } from './run.mjs';

export function parseAllArgs(argv) {
  const out = { dryRun: false, emit: null, lanes: [...LANES], quota: undefined, width: 3, fixtures: undefined, evidence: undefined, render: true, llm: true, flushEvery: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--emit') out.emit = argv[++i];
    else if (a === '--lanes') out.lanes = String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--quota') out.quota = Number(argv[++i]);
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--fixtures') out.fixtures = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : FIXTURES_DIR;
    else if (a === '--evidence') out.evidence = argv[++i];
    else if (a === '--no-render') out.render = false;
    else if (a === '--no-llm') out.llm = false;
    else if (a === '--flush-every') out.flushEvery = Number(argv[++i]);
    else throw new Error(`unknown argument ${a}`);
  }
  for (const l of out.lanes) if (!LANES.includes(l)) throw new Error(`unknown lane "${l}"`);
  if (out.quota !== undefined && !(Number.isInteger(out.quota) && out.quota > 0)) throw new Error('--quota must be a positive integer');
  if (!(Number.isInteger(out.width) && out.width > 0)) throw new Error('--width must be a positive integer');
  return out;
}

/**
 * Run the given lanes concurrently against one db + one generator. Lanes with a zero quota and no
 * override are reported as skipped (they would throw in runLane). Returns per-lane summaries.
 */
export async function runAll({ lanes, db, statuslogFactory, generator, quota, dryRun, width, flushEvery = 10, now = () => new Date(), out = (s) => console.log(s) }) {
  const results = await Promise.all(
    lanes.map(async (lane) => {
      const statuslog = statuslogFactory(lane);
      try {
        const laneRow = await db.getLane(lane);
        if (quota === undefined && laneRow && !(laneRow.daily_quota > 0) && !laneRow.blocked_reason) {
          out(`[run-all] lane "${lane}" has daily_quota 0; skipped`);
          return { lane, skipped: true, reason: 'daily_quota 0' };
        }
        return await runLane({ lane, quota, dryRun, db, statuslog, generate: generator.generate, now, flushEvery, width, out });
      } catch (e) {
        out(`[run-all] lane "${lane}" aborted: ${e.message}`);
        return { lane, aborted: true, error: String(e.message ?? e) };
      }
    }),
  );
  return results;
}

async function main(argv) {
  const args = parseAllArgs(argv);
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let db;
  let client = null;
  if (args.fixtures || (args.dryRun && !(url && key))) {
    const dir = args.fixtures ?? FIXTURES_DIR;
    db = createFixtureDb(loadFixtures(dir));
    console.log(`[run-all] using local fixtures from ${dir}`);
  } else {
    if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not set');
    assertServiceRole(key);
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(url, key, { auth: { persistSession: false } });
    db = createSupabaseDb(client);
  }
  const generator = await buildGenerator({ client, evidenceDir: args.evidence ?? (db.kind === 'fixture' ? EVIDENCE_FIXTURES_DIR : null), render: args.render, llm: args.llm, emit: args.emit, dryRun: args.dryRun });
  try {
    const results = await runAll({ lanes: args.lanes, db, statuslogFactory: () => createStatusLog({ dryRun: args.dryRun }), generator, quota: args.quota, dryRun: args.dryRun, width: args.width, flushEvery: args.flushEvery });
    const rows = results.map((r) => (r.skipped || r.aborted ? { lane: r.lane, status: r.skipped ? 'skipped' : 'aborted', note: r.reason ?? r.error } : { lane: r.lane, status: r.blocked ? 'blocked' : 'ran', found: r.found, drafted: r.drafted, in_range: r.in_range, out_of_range: r.out_of_range, thin: r.thin, failed: r.failed, duplicates: r.duplicates, cursor: r.cursor_out?.last_id ?? null }));
    console.table(rows);
    if (results.some((r) => r.aborted || (r.failed ?? 0) > 0)) process.exitCode = 1;
  } finally {
    await closeGenerator(generator);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`[run-all] ${e.message}`);
    process.exit(2);
  });
}
