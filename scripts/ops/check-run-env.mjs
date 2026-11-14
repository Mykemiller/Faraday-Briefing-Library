#!/usr/bin/env node
// BL3-10 (FDY-336): run-environment verifier.
//
// One command proves an unattended session can run the lanes, the review chain and the Notion
// status log:
//
//   node scripts/ops/check-run-env.mjs                 # checks only; exit 1 on any FAIL
//   node scripts/ops/check-run-env.mjs --write-test    # also appends one "BL3-10 · env check · <result>"
//                                                      # line under "## Log" on the status page
//   node scripts/ops/check-run-env.mjs --json          # machine-readable results
//
// SECRET HYGIENE: no secret value is ever printed, logged or returned. Variables are checked by
// NAME; the only thing read out of SUPABASE_SERVICE_ROLE_KEY is the JWT payload's `ref` claim
// (a public project ref) and whether the value is wrapped in quote characters. HTTP error
// bodies are never echoed, only status codes.
//
// Checks (decision 1 in the issue):
//   a env-names        SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_TOKEN, ANTHROPIC_API_KEY present
//   b service-key      no leading/trailing quote characters; JWT ref === ycadmmngkdhvpcsrcuaq
//   c supabase-rest    GET <SUPABASE_URL>/rest/v1/briefings?select=id&limit=1 with the key → 200
//   d notion-egress    HEAD https://api.notion.com answers (any HTTP status = reachable)
//   e notion-page      GET /v1/pages/<status page> with NOTION_TOKEN → 200
//   f anthropic-egress HEAD https://api.anthropic.com answers (any HTTP status = reachable)
//   g node-proxy       NODE_USE_ENV_PROXY=1 whenever HTTPS_PROXY is set (Node's fetch ignores the
//                      proxy otherwise, so every egress check above would fail)

import { pathToFileURL } from 'node:url';

export const PROJECT_REF = 'ycadmmngkdhvpcsrcuaq';
export const STATUS_PAGE_ID = '41389a0c1680803dbb99e929c19d402d';
export const NOTION_API = 'https://api.notion.com';
export const NOTION_VERSION = '2022-06-28';
export const ANTHROPIC_API = 'https://api.anthropic.com';
export const REQUIRED_ENV = Object.freeze(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NOTION_TOKEN', 'ANTHROPIC_API_KEY']);
export const EGRESS_HOSTS = Object.freeze([`${PROJECT_REF}.supabase.co`, 'api.notion.com', 'api.anthropic.com', 'github.com']);
export const DEFAULT_TIMEOUT_MS = 10_000;

// ASCII quotes, typographic quotes (the 2026-11-12 failure), backtick.
const QUOTE_CHARS = new Set(['"', "'", '`', '“', '”', '‘', '’', '«', '»']);

const present = (env, name) => typeof env[name] === 'string' && env[name].trim() !== '';

/** True when the value starts or ends with a quote character (ASCII or typographic) or whitespace. */
export function hasWrappingQuotes(value) {
  const s = String(value ?? '');
  if (!s) return false;
  return QUOTE_CHARS.has(s[0]) || QUOTE_CHARS.has(s[s.length - 1]);
}

export function hasWrappingWhitespace(value) {
  const s = String(value ?? '');
  return s !== s.trim();
}

/**
 * The `ref` claim of a Supabase JWT, or a reason it cannot be read. Never returns any other part
 * of the token. Quote characters are stripped first so a quoted key still reports its ref.
 * @returns {{ref: string|null, kind: 'jwt'|'sb_secret'|'unknown', reason?: string}}
 */
export function decodeJwtRef(value) {
  let s = String(value ?? '').trim();
  while (s && QUOTE_CHARS.has(s[0])) s = s.slice(1);
  while (s && QUOTE_CHARS.has(s[s.length - 1])) s = s.slice(0, -1);
  s = s.trim();
  if (s.startsWith('sb_secret_')) return { ref: null, kind: 'sb_secret', reason: 'opaque sb_secret_ key (no JWT ref to decode)' };
  const parts = s.split('.');
  if (parts.length !== 3) return { ref: null, kind: 'unknown', reason: 'not a JWT (expected 3 dot-separated parts)' };
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    const ref = typeof payload?.ref === 'string' ? payload.ref : null;
    return ref ? { ref, kind: 'jwt' } : { ref: null, kind: 'jwt', reason: 'JWT payload has no ref claim' };
  } catch {
    return { ref: null, kind: 'unknown', reason: 'JWT payload is not valid base64url JSON' };
  }
}

/** The key with wrapping quotes/whitespace removed, for use in a request header only. */
function cleanKey(value) {
  let s = String(value ?? '').trim();
  while (s && QUOTE_CHARS.has(s[0])) s = s.slice(1);
  while (s && QUOTE_CHARS.has(s[s.length - 1])) s = s.slice(0, -1);
  return s.trim();
}

/** Hostname of a URL, or null. Hostnames are not secret. */
function hostOf(url) {
  try {
    return new URL(String(url).trim()).hostname;
  } catch {
    return null;
  }
}

/** A short, value-free description of a network error (fetch "failed" + its cause code/message). */
export function describeNetworkError(e) {
  const cause = e?.cause;
  const bits = [e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timed out' : e?.message || 'network error'];
  if (cause?.code) bits.push(String(cause.code));
  else if (cause?.message && cause.message !== e?.message) bits.push(String(cause.message));
  // Never echo anything that looks like a credential, just in case a library put one in a message.
  return bits.join(': ').replace(/(Bearer\s+)\S+/gi, '$1***').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***').slice(0, 160);
}

const pass = (id, name, reason) => ({ id, name, status: 'PASS', reason });
const fail = (id, name, reason) => ({ id, name, status: 'FAIL', reason });
const skip = (id, name, reason) => ({ id, name, status: 'SKIP', reason });

async function timedFetch(fetchImpl, url, init, timeoutMs) {
  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
  return fetchImpl(url, { ...init, signal });
}

async function reachable(fetchImpl, id, name, url, timeoutMs) {
  try {
    const res = await timedFetch(fetchImpl, url, { method: 'HEAD' }, timeoutMs);
    return pass(id, name, `${hostOf(url)} answered HTTP ${res.status}`);
  } catch (e) {
    return fail(id, name, `${hostOf(url)} unreachable (${describeNetworkError(e)}); add it to the environment's allowed hosts`);
  }
}

/**
 * Run every check. Pure apart from `fetch`; inject `env` and `fetch` in tests.
 * @param {{env?: Record<string, string|undefined>, fetch?: typeof fetch, timeoutMs?: number}} [opts]
 * @returns {Promise<Array<{id: string, name: string, status: 'PASS'|'FAIL'|'SKIP', reason: string}>>}
 */
export async function runChecks(opts = {}) {
  const env = opts.env ?? process.env;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const results = [];

  // (a) names present
  const missing = REQUIRED_ENV.filter((n) => !present(env, n));
  results.push(
    missing.length
      ? fail('a', 'env-names', `missing: ${missing.join(', ')}`)
      : pass('a', 'env-names', `present: ${REQUIRED_ENV.join(', ')}`),
  );

  // (b) service key shape + ref
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!present(env, 'SUPABASE_SERVICE_ROLE_KEY')) {
    results.push(skip('b', 'service-key', 'SUPABASE_SERVICE_ROLE_KEY absent'));
  } else {
    const problems = [];
    if (hasWrappingQuotes(key)) problems.push('value is wrapped in quote characters');
    if (hasWrappingWhitespace(key)) problems.push('value has leading/trailing whitespace');
    const { ref, kind, reason } = decodeJwtRef(key);
    if (kind === 'sb_secret') problems.push('opaque sb_secret_ key: use the legacy JWT service_role key so the ref can be verified');
    else if (!ref) problems.push(reason ?? 'no ref claim');
    else if (ref !== PROJECT_REF) problems.push(`JWT ref=${ref}, expected ${PROJECT_REF}`);
    results.push(problems.length ? fail('b', 'service-key', problems.join('; ')) : pass('b', 'service-key', `no wrapping quotes; JWT ref=${ref}`));
  }

  // (c) PostgREST answers 200 with the key
  if (!present(env, 'SUPABASE_URL') || !present(env, 'SUPABASE_SERVICE_ROLE_KEY')) {
    results.push(skip('c', 'supabase-rest', 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY absent'));
  } else {
    const host = hostOf(env.SUPABASE_URL);
    if (host !== `${PROJECT_REF}.supabase.co`) {
      results.push(fail('c', 'supabase-rest', `SUPABASE_URL host is ${host ?? '(unparseable)'}, expected ${PROJECT_REF}.supabase.co`));
    } else {
      const k = cleanKey(key);
      const url = `https://${host}/rest/v1/briefings?select=id&limit=1`;
      try {
        const res = await timedFetch(fetchImpl, url, { method: 'GET', headers: { apikey: k, Authorization: `Bearer ${k}` } }, timeoutMs);
        results.push(
          res.status === 200
            ? pass('c', 'supabase-rest', `GET /rest/v1/briefings → 200`)
            : fail('c', 'supabase-rest', `GET /rest/v1/briefings → ${res.status}${res.status === 401 ? ' (key rejected: wrong project or malformed)' : ''}`),
        );
      } catch (e) {
        results.push(fail('c', 'supabase-rest', `${host} unreachable (${describeNetworkError(e)})`));
      }
    }
  }

  // (d) Notion egress
  results.push(await reachable(fetchImpl, 'd', 'notion-egress', NOTION_API, timeoutMs));

  // (e) Notion status page readable with the token
  if (!present(env, 'NOTION_TOKEN')) {
    results.push(skip('e', 'notion-page', 'NOTION_TOKEN absent'));
  } else {
    try {
      const res = await timedFetch(
        fetchImpl,
        `${NOTION_API}/v1/pages/${STATUS_PAGE_ID}`,
        { method: 'GET', headers: { Authorization: `Bearer ${cleanKey(env.NOTION_TOKEN)}`, 'Notion-Version': NOTION_VERSION } },
        timeoutMs,
      );
      const hint = res.status === 401 ? ' (token invalid)' : res.status === 404 ? ' (page not shared with the integration)' : '';
      results.push(
        res.status === 200
          ? pass('e', 'notion-page', `status page ${STATUS_PAGE_ID} readable`)
          : fail('e', 'notion-page', `GET /v1/pages/${STATUS_PAGE_ID} → ${res.status}${hint}`),
      );
    } catch (e) {
      results.push(fail('e', 'notion-page', `api.notion.com unreachable (${describeNetworkError(e)})`));
    }
  }

  // (f) Anthropic egress
  results.push(await reachable(fetchImpl, 'f', 'anthropic-egress', ANTHROPIC_API, timeoutMs));

  // (g) Node proxy switch
  const proxy = env.HTTPS_PROXY || env.https_proxy;
  if (!proxy) results.push(skip('g', 'node-proxy', 'HTTPS_PROXY not set (no proxy to honour)'));
  else if (env.NODE_USE_ENV_PROXY === '1') results.push(pass('g', 'node-proxy', 'HTTPS_PROXY set and NODE_USE_ENV_PROXY=1'));
  else results.push(fail('g', 'node-proxy', `HTTPS_PROXY set but NODE_USE_ENV_PROXY=${env.NODE_USE_ENV_PROXY === undefined ? '(unset)' : 'not 1'}`));

  return results;
}

export function formatResult(r) {
  return `${r.status.padEnd(4)} ${r.id} ${r.name.padEnd(16)} ${r.reason}`;
}

export function overall(results) {
  return results.some((r) => r.status === 'FAIL') ? 'FAIL' : 'PASS';
}

/** Columns of the --write-test status-log line (statuslog prefixes the CT timestamp). */
export function writeTestParts(results) {
  const o = overall(results);
  const counts = ['PASS', 'FAIL', 'SKIP'].map((st) => `${results.filter((r) => r.status === st).length} ${st}`).join(', ');
  const failed = results.filter((r) => r.status === 'FAIL').map((r) => r.name);
  return [
    'BL3-10',
    'env check',
    o,
    `${counts}${failed.length ? ` (failed: ${failed.join(', ')})` : ''}; written from the run environment by scripts/ops/check-run-env.mjs`,
  ];
}

async function main(argv) {
  const json = argv.includes('--json');
  const writeTest = argv.includes('--write-test');
  const results = await runChecks();
  const o = overall(results);
  if (json) console.log(JSON.stringify({ overall: o, results }, null, 2));
  else {
    for (const r of results) console.log(formatResult(r));
    console.log(`${o} overall (${results.length} checks)`);
  }

  if (writeTest) {
    if (!present(process.env, 'NOTION_TOKEN')) {
      console.log('SKIP write-test: NOTION_TOKEN absent, nothing written');
    } else {
      const { createStatusLog } = await import('../statuslog.mjs');
      const sl = createStatusLog({ token: cleanKey(process.env.NOTION_TOKEN) });
      const line = sl.noteParts(writeTestParts(results));
      try {
        const r = await sl.flush();
        console.log(r.skipped ? 'SKIP write-test: statuslog in dry-run' : `PASS write-test: appended under "## Log": ${line}`);
      } catch (e) {
        console.log(`FAIL write-test: ${describeNetworkError(e)}`);
        process.exitCode = 1;
      }
    }
  }
  if (o === 'FAIL') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`check-run-env crashed: ${describeNetworkError(e)}`);
    process.exit(1);
  });
}
