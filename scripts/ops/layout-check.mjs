#!/usr/bin/env node
// BL3-04 (FDY-337): responsive layout check for /library.
//
// For each width (default 390, 1280, 1920, 2560) it loads /library, saves a screenshot and asserts:
//   overflow    document.documentElement.scrollWidth <= clientWidth (no horizontal page scroll)
//   header      the masthead's right edge, and every child of it, is <= the viewport width
//   sidebar     ≥ 768 px: the sidebar is visible and exactly 248 px wide; < 768 px: hidden
//   grid        ≥ 768 px: the first card grid spans the content column, i.e. its width is at least
//               min(1680, viewport − 248 − gutters) − 2 px; < 768 px: one card per row
// Exit 1 if any assertion fails.
//
//   node scripts/ops/layout-check.mjs --url https://<deployment> [--out docs/ops/screens] [--prefix after]
//   node scripts/ops/layout-check.mjs --url http://localhost:3000 --via-node      # see below
//   node scripts/ops/layout-check.mjs --html page.html --static .next/static      # SSR snapshot
//   options: --widths 390,1280 · --path /library · --json
//
// Sandbox modes (Claude Code cloud sessions):
//   --via-node   Chromium there cannot open loopback or egress sockets; every request is fetched by
//                Node and fulfilled through page.route. Clerk dev-instance handshake redirects for
//                document requests are avoided by not sending `Accept: text/html` / Sec-Fetch-*.
//   --html/--static  render a server-rendered HTML page (e.g. fetched from a Vercel deployment with
//                the Vercel MCP) with a local `next build`'s static assets; scripts are not run.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_WIDTHS = [390, 1280, 1920, 2560];
export const SIDEBAR_PX = 248;
export const CONTENT_MAX_PX = 1680;
export const MD_BREAKPOINT = 768;

export function parseArgs(argv) {
  const o = { widths: DEFAULT_WIDTHS, out: 'docs/ops/screens', prefix: 'layout', path: '/library', viaNode: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === '--url') o.url = v();
    else if (a === '--html') o.html = v();
    else if (a === '--static') o.staticDir = v();
    else if (a === '--out') o.out = v();
    else if (a === '--prefix') o.prefix = v();
    else if (a === '--path') o.path = v();
    else if (a === '--widths') o.widths = v().split(',').map(Number);
    else if (a === '--via-node') o.viaNode = true;
    else if (a === '--json') o.json = true;
  }
  if (!o.url && !o.html) throw new Error('need --url <base> or --html <file>');
  return o;
}

/**
 * Pure verdicts for one width from measured layout numbers (unit tested).
 * @param {{width:number, scrollWidth:number, clientWidth:number, headerRight:number|null, headerChildMaxRight:number|null,
 *          sidebarVisible:boolean, sidebarWidth:number|null, gridWidth:number|null, contentLeft:number|null, contentPadRight:number|null, gridColumns:number|null}} m
 */
export function evaluate(m) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  add('overflow', m.scrollWidth <= m.clientWidth, `scrollWidth ${m.scrollWidth} <= clientWidth ${m.clientWidth}`);
  const hr = Math.max(m.headerRight ?? 0, m.headerChildMaxRight ?? 0);
  add('header', m.headerRight !== null && hr <= m.width + 0.5, `header right edge ${Math.round(hr)} <= ${m.width}`);
  if (m.width >= MD_BREAKPOINT) {
    add('sidebar', m.sidebarVisible && Math.round(m.sidebarWidth ?? 0) === SIDEBAR_PX, `sidebar ${m.sidebarVisible ? Math.round(m.sidebarWidth ?? 0) : 'hidden'} px (want ${SIDEBAR_PX})`);
    // The content column is the viewport minus the sidebar and the main column's own padding.
    const available = m.width - SIDEBAR_PX - (m.contentLeft ?? 0) - (m.contentPadRight ?? 0);
    const want = Math.min(CONTENT_MAX_PX, available) - 2;
    add('grid', m.gridWidth !== null && m.gridWidth >= want, `grid ${Math.round(m.gridWidth ?? 0)} px >= ${Math.round(want)} px (content max ${CONTENT_MAX_PX})`);
  } else {
    add('sidebar', !m.sidebarVisible, `sidebar ${m.sidebarVisible ? 'visible' : 'hidden'} (want hidden)`);
    add('grid', m.gridColumns === null || m.gridColumns === 1, `grid columns ${m.gridColumns ?? 'n/a'} (want 1)`);
  }
  return checks;
}

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req('playwright');
  } catch {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(join(root, '/'))('playwright');
  }
}

const DROP = new Set(['host', 'connection', 'content-length', 'accept-encoding', 'upgrade-insecure-requests']);
async function routeViaNode(page, target) {
  await page.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.host !== 'app.local') return route.abort();
    try {
      const headers = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => !DROP.has(k.toLowerCase()) && !k.toLowerCase().startsWith('sec-fetch-')));
      if ((headers.accept ?? '').includes('text/html')) delete headers.accept;
      const init = { method: req.method(), headers, redirect: 'manual' };
      const pd = req.postDataBuffer();
      if (pd && req.method() !== 'GET' && req.method() !== 'HEAD') init.body = pd;
      const res = await fetch(`${target}${u.pathname}${u.search}`, init);
      const out = {};
      res.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) out[k] = v; });
      return route.fulfill({ status: res.status, headers: out, body: Buffer.from(await res.arrayBuffer()) });
    } catch {
      return route.abort();
    }
  });
}

async function routeSnapshot(page, html, staticDir) {
  const css = readdirSync(join(staticDir, 'css')).filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(staticDir, 'css', f), 'utf8')).join('\n');
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.host !== 'app.local') return route.abort();
    if (u.pathname.startsWith('/_next/static/css/')) return route.fulfill({ status: 200, contentType: 'text/css', body: css });
    if (u.pathname.startsWith('/_next/static/media/')) {
      const f = join(staticDir, 'media', u.pathname.split('/').pop());
      if (existsSync(f)) return route.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(f) });
      return route.abort();
    }
    if (u.pathname.startsWith('/_next/')) return route.abort(); // no scripts in snapshot mode
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
}

/** Runs in the page: raw layout numbers for evaluate(). */
function measure() {
  const de = document.documentElement;
  const header = document.querySelector('header, [data-masthead]') ?? document.body.firstElementChild;
  const hr = header ? header.getBoundingClientRect().right : null;
  let childMax = null;
  if (header) for (const el of header.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width > 0) childMax = Math.max(childMax ?? 0, r.right); }
  const aside = document.querySelector('aside');
  const asideVisible = !!aside && getComputedStyle(aside).display !== 'none' && aside.getBoundingClientRect().width > 0;
  const main = document.querySelector('main');
  const ms = main ? getComputedStyle(main) : null;
  const grid = document.querySelector('main [data-shelf-available], main details[open] .grid, main .grid');
  let cols = null;
  if (grid) cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
  return {
    scrollWidth: de.scrollWidth,
    clientWidth: de.clientWidth,
    headerRight: hr,
    headerChildMaxRight: childMax,
    sidebarVisible: asideVisible,
    sidebarWidth: asideVisible ? aside.getBoundingClientRect().width : null,
    gridWidth: grid ? grid.getBoundingClientRect().width : null,
    contentLeft: ms ? parseFloat(ms.paddingLeft) : null,
    contentPadRight: ms ? parseFloat(ms.paddingRight) : null,
    gridColumns: cols,
  };
}

export async function run(o) {
  const { chromium } = loadPlaywright();
  mkdirSync(o.out, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const width of o.widths) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
      let url = `${o.url ?? 'https://app.local'}${o.path}`;
      if (o.html) {
        await routeSnapshot(page, readFileSync(o.html, 'utf8'), o.staticDir ?? '.next/static');
        url = `https://app.local${o.path}`;
      } else if (o.viaNode) {
        await routeViaNode(page, o.url.replace(/\/$/, ''));
        url = `https://app.local${o.path}`;
      }
      await page.goto(url, { waitUntil: o.html ? 'load' : 'networkidle' });
      await page.waitForTimeout(300);
      const m = { width, ...(await page.evaluate(measure)) };
      const checks = evaluate(m);
      const shot = join(o.out, `${o.prefix}-${width}.png`);
      await page.screenshot({ path: shot });
      results.push({ width, screenshot: shot, ok: checks.every((c) => c.ok), checks, measured: m });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return results;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const results = await run(o);
  if (o.json) console.log(JSON.stringify(results, null, 2));
  else {
    for (const r of results) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.width}px  ${r.screenshot}`);
      for (const c of r.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(8)} ${c.detail}`);
    }
  }
  const ok = results.every((r) => r.ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} overall (${results.length} widths)`);
  if (!ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`layout-check crashed: ${e.message}`);
    process.exit(1);
  });
}
