// BL2-04 (FDY-280): status-log writer for the Briefing Library V2.0 Regeneration Status Log.
//
// Appends paragraph blocks to the Notion status page through the public Notion API (not MCP),
// so the same module works from pg_cron-driven workers, Vercel, and Claude Code alike.
//
//   import { createStatusLog, log, question, flush } from './scripts/statuslog.mjs';
//
//   const sl = createStatusLog();                       // NOTION_TOKEN from env, never committed
//   sl.log({ briefing_id, lane, tier, gate: 'DRAFTED', result: 'PASS', sentence: '...' });
//   sl.question({ issue: 'FDY-280', text: '...', default: '...' });
//   await sl.flush();                                   // one GET + ≤1 PATCH per 100 lines per section
//
// Line formats (fixed by the page header; time is America/Chicago, rendered "CT"):
//   log       YYYY-MM-DD HH:MM CT · <id8> · <lane> · <tier> · <gate> · <result> · <sentence>
//   question  YYYY-MM-DD HH:MM CT · <issue> · <text> · Default: <default>
//
// Placement: log lines go under the "## Log" heading, questions under "## Questions for Myke".
// Both are located by reading the page's top-level children and inserting with the API's
// `after` parameter at the end of the matching section, so the order of the two sections on the
// page does not matter and nothing is ever inserted into the wrong one.
//
// Limits honoured: 100 blocks per append call, 2,000 characters per rich-text run. 429 responses
// are retried with the server's Retry-After (else exponential backoff); 5xx likewise.
//
// CLI (handy for one-off lines from a shell):
//   node scripts/statuslog.mjs log --briefing-id <uuid> --lane <lane> --tier <tier> \
//        --gate DRAFTED --result PASS --sentence "..." [--dry-run]
//   node scripts/statuslog.mjs question --issue FDY-280 --text "..." --default "..." [--dry-run]
//   node scripts/statuslog.mjs note "free text line" [--dry-run]
//
// Without NOTION_TOKEN (or with --dry-run / { dryRun: true }) nothing is sent: every line that
// would have been appended is printed to stdout instead.

import { pathToFileURL } from 'node:url';

export const STATUS_PAGE_ID = '41389a0c1680803dbb99e929c19d402d';
export const NOTION_API = 'https://api.notion.com/v1';
export const NOTION_VERSION = '2022-06-28';
export const TIME_ZONE = 'America/Chicago';
export const MAX_BLOCKS_PER_CALL = 100;
export const MAX_RICH_TEXT_CHARS = 2000;

export const SECTIONS = Object.freeze({ log: 'Log', question: 'Questions for Myke' });
export const GATES = Object.freeze(['DRAFTED', 'G1-AUTO', 'G2-PANEL', 'G3-XCHECK', 'QUEUED', 'PUBLISHED']);
export const RESULTS = Object.freeze(['PASS', 'FAIL', 'PARKED', 'PUBLISHED']);

const SEP = ' · ';

// ---------------------------------------------------------------------------------------------
// Formatting (pure)
// ---------------------------------------------------------------------------------------------

const ctFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "YYYY-MM-DD HH:MM CT" for the given instant, in America/Chicago (CST or CDT as the date dictates). */
export function formatCt(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new TypeError('formatCt: invalid date');
  const p = Object.fromEntries(ctFormatter.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} CT`;
}

/** First 8 characters of a briefing id (uuid or otherwise). */
export function shortId(id) {
  const s = String(id ?? '').trim();
  if (!s) throw new TypeError('briefing_id is required');
  return s.slice(0, 8);
}

/** One line of text: trims, collapses whitespace/newlines, strips the separator so columns stay fixed. */
function cell(value, name) {
  const s = String(value ?? '').replace(/\s+/g, ' ').replace(/\s*·\s*/g, ', ').trim();
  if (!s) throw new TypeError(`${name} is required`);
  return s;
}

export function formatLogLine({ briefing_id, lane, tier, gate, result, sentence }, now = new Date()) {
  const g = cell(gate, 'gate');
  if (!GATES.includes(g)) throw new RangeError(`gate must be one of ${GATES.join('|')}, got "${g}"`);
  const r = cell(result, 'result');
  if (!RESULTS.includes(r)) throw new RangeError(`result must be one of ${RESULTS.join('|')}, got "${r}"`);
  return [formatCt(now), shortId(briefing_id), cell(lane, 'lane'), cell(tier, 'tier'), g, r, cell(sentence, 'sentence')].join(SEP);
}

export function formatQuestionLine({ issue, text, default: dflt }, now = new Date()) {
  return [formatCt(now), cell(issue, 'issue'), cell(text, 'text'), `Default: ${cell(dflt, 'default')}`].join(SEP);
}

export function formatNoteLine(text, now = new Date()) {
  return [formatCt(now), cell(text, 'text')].join(SEP);
}

/** A Notion paragraph block carrying one line (truncated to the rich-text limit). */
export function paragraphBlock(line) {
  const content = line.length > MAX_RICH_TEXT_CHARS ? `${line.slice(0, MAX_RICH_TEXT_CHARS - 1)}…` : line;
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } };
}

export function chunk(items, size = MAX_BLOCKS_PER_CALL) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Plain text of a heading block, or null for non-heading blocks. */
function headingText(block) {
  const t = block?.type;
  if (!t || !/^heading_[123]$/.test(t)) return null;
  return (block[t]?.rich_text ?? []).map((r) => r.plain_text ?? r.text?.content ?? '').join('').trim();
}

/**
 * Locate each section's heading and the last block currently in it (the insertion anchor).
 * A section runs from its heading to the block before the next heading, or to the end of the page.
 */
export function locateSections(children, sections = SECTIONS) {
  const wanted = new Map(Object.entries(sections).map(([k, title]) => [title.toLowerCase(), k]));
  /** @type {Record<string, {headingId: string, lastId: string, count: number}>} */
  const found = {};
  /** @type {string|null} */
  let current = null;
  for (const block of children) {
    const h = headingText(block);
    if (h !== null) {
      const key = wanted.get(h.toLowerCase());
      current = key ?? null;
      if (key) found[key] = { headingId: block.id, lastId: block.id, count: 0 };
      continue;
    }
    if (current && found[current]) {
      found[current].lastId = block.id;
      found[current].count += 1;
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{token?: string, pageId?: string, fetch?: any, now?: () => Date, sleep?: (ms: number) => Promise<void>, dryRun?: boolean, out?: (line: string) => void, maxRetries?: number, baseDelayMs?: number, apiBase?: string}} [opts]
 */
export function createStatusLog(opts = {}) {
  const {
    token = process.env.NOTION_TOKEN,
    pageId = STATUS_PAGE_ID,
    fetch: fetchImpl = globalThis.fetch,
    now = () => new Date(),
    sleep = defaultSleep,
    dryRun = false,
    out = (line) => console.log(line),
    maxRetries = 5,
    baseDelayMs = 1000,
    apiBase = NOTION_API,
  } = opts;

  const queue = [];

  const headers = () => ({
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  });

  async function request(method, path, body) {
    let attempt = 0;
    for (;;) {
      const res = await fetchImpl(`${apiBase}${path}`, {
        method,
        headers: headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) return res.json();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= maxRetries) {
        let detail = '';
        try {
          const j = await res.json();
          detail = j?.message ? `: ${j.message}` : '';
        } catch {
          /* no body */
        }
        // The token is never part of this message.
        throw new Error(`Notion ${method} ${path} failed with ${res.status}${detail}`);
      }
      const ra = Number(res.headers?.get?.('retry-after'));
      const delay = Number.isFinite(ra) && ra > 0 ? ra * 1000 : baseDelayMs * 2 ** attempt;
      attempt += 1;
      await sleep(delay);
    }
  }

  async function listChildren() {
    const all = [];
    let cursor;
    do {
      const qs = new URLSearchParams({ page_size: '100' });
      if (cursor) qs.set('start_cursor', cursor);
      const page = await request('GET', `/blocks/${pageId}/children?${qs}`);
      all.push(...(page.results ?? []));
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor);
    return all;
  }

  /** Append lines after `afterId`, ≤100 per call; returns the id of the last block appended. */
  async function appendAfter(afterId, lines) {
    let after = afterId;
    let calls = 0;
    for (const part of chunk(lines, MAX_BLOCKS_PER_CALL)) {
      const body = { children: part.map(paragraphBlock) };
      if (after) body.after = after;
      const res = await request('PATCH', `/blocks/${pageId}/children`, body);
      calls += 1;
      const results = res?.results ?? [];
      if (results.length) after = results[results.length - 1].id;
      else after = undefined; // unknown position: fall back to appending at the end of the page
    }
    return { after, calls };
  }

  function log(entry) {
    const line = formatLogLine(entry, now());
    queue.push({ section: 'log', line });
    return line;
  }

  function question(entry) {
    const line = formatQuestionLine(entry, now());
    queue.push({ section: 'question', line });
    return line;
  }

  function note(text) {
    const line = formatNoteLine(text, now());
    queue.push({ section: 'log', line });
    return line;
  }

  /** Send everything queued. Returns { appended, calls, lines, skipped }. */
  async function flush() {
    const pending = queue.splice(0, queue.length);
    if (!pending.length) return { appended: 0, calls: 0, lines: [], skipped: false };

    if (dryRun || !token) {
      const why = dryRun ? 'dry-run' : 'no NOTION_TOKEN';
      for (const p of pending) out(`[statuslog ${why}] ${SECTIONS[p.section]} ← ${p.line}`);
      return { appended: 0, calls: 0, lines: pending.map((p) => p.line), skipped: true };
    }

    const children = await listChildren();
    const sections = locateSections(children);
    let appended = 0;
    let calls = 1;
    for (const section of Object.keys(SECTIONS)) {
      const lines = pending.filter((p) => p.section === section).map((p) => p.line);
      if (!lines.length) continue;
      const sec = sections[section];
      if (!sec) throw new Error(`Status page ${pageId} has no "## ${SECTIONS[section]}" heading; refusing to append`);
      const r = await appendAfter(sec.lastId, lines);
      appended += lines.length;
      calls += r.calls;
    }
    return { appended, calls, lines: pending.map((p) => p.line), skipped: false };
  }

  return { log, question, note, flush, pending: () => queue.length, pageId, dryRun: dryRun || !token };
}

// Lazily-built default instance (reads NOTION_TOKEN when first used).
let defaultInstance;
function dflt() {
  if (!defaultInstance) defaultInstance = createStatusLog();
  return defaultInstance;
}
export const log = (entry) => dflt().log(entry);
export const question = (entry) => dflt().question(entry);
export const note = (text) => dflt().note(text);
export const flush = () => dflt().flush();

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export function parseCliArgs(argv) {
  const [cmd, ...rest] = argv;
  const flags = {};
  const positional = [];
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--dry-run') flags.dryRun = true;
    else if (a.startsWith('--')) {
      flags[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = rest[i + 1];
      i += 1;
    } else positional.push(a);
  }
  return { cmd, flags, positional };
}

async function main(argv) {
  const { cmd, flags, positional } = parseCliArgs(argv);
  const sl = createStatusLog({ dryRun: Boolean(flags.dryRun) });
  if (cmd === 'log') {
    sl.log({ briefing_id: flags.briefingId, lane: flags.lane, tier: flags.tier, gate: flags.gate, result: flags.result, sentence: flags.sentence });
  } else if (cmd === 'question') {
    sl.question({ issue: flags.issue, text: flags.text, default: flags.default });
  } else if (cmd === 'note') {
    sl.note(positional.join(' ') || flags.text);
  } else {
    console.error('usage: node scripts/statuslog.mjs <log|question|note> [flags] [--dry-run]');
    process.exit(2);
  }
  const r = await sl.flush();
  if (!r.skipped) for (const line of r.lines) console.log(`appended: ${line}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
