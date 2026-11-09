// BL2-06 (FDY-282): render a draft manuscript to HTML, print it to a Letter PDF with the
// pre-installed Chromium (Playwright) and count the pages. Used by G1-AUTO's page check and to
// produce the preview the sign-off queue links to.
//
//   Deep tier      → scripts/deep-brief/build.mjs + shell.html (the BL-08 renderer of record).
//   Standard/Profile → the Markdown renderer below, styled with the BL-09 template CSS (same
//                    faces, sizes, @page rule), so the count tracks docs/templates/test-results.md
//                    as closely as a Markdown manuscript can.
//
// Fonts come from Google Fonts; when the network is closed the fallback stack sets wider and the
// count can rise — the result records `fonts_loaded` so a reviewer can tell. PDFs are never committed.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

// Playwright is pre-installed globally in the cloud containers (resolved through NODE_PATH), so it is
// loaded with require() like scripts/deep-brief/pdf.cjs does; PLAYWRIGHT_PATH overrides the location.
const require = createRequire(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cite = (s) => s.replace(/\[((?:S?\d+)(?:\s*,\s*S?\d+)*)\]/g, (_, ns) =>
  `<sup class="cite">${ns.split(/\s*,\s*/).map((n) => `<a href="#src-${n.replace(/^S/i, '')}">${n.replace(/^S/i, '')}</a>`).join(',')}</sup>`);
const inline = (s) => cite(esc(s))
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

/** The BL-09 template stylesheet (docs/templates/standard.md §5), plus print rules for Markdown output. */
export const STYLE = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root { color-scheme: light; --paper:#fbfbf8; --ink:#1b211d; --muted:#5a645c; --forest:#1f4a36; --gold:#a8812f; --cream:#f6efdc; --hair:#d5dbd3;
  --serif:"Source Serif 4", Georgia, "DejaVu Serif", serif; --sans:"IBM Plex Sans", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif; --mono:"IBM Plex Mono", "DejaVu Sans Mono", monospace; }
@page { size: Letter; margin: 0.7in 0.75in 0.75in; }
html { background: var(--paper); }
body { background: var(--paper); color: var(--ink); font-family: var(--serif); font-size: 10.5pt; line-height: 1.5; margin: 0; padding: 0; }
h1, h2, h3 { font-family: var(--serif); color: var(--forest); text-wrap: balance; margin: 0; }
h1 { font-size: 26pt; line-height: 1.12; font-weight: 700; }
h2 { font-size: 15pt; line-height: 1.25; font-weight: 600; margin-top: 4pt; break-after: avoid; }
h3 { font-size: 11pt; font-weight: 600; color: var(--ink); margin-top: 8pt; break-after: avoid; }
p { margin: 0 0 7pt; max-width: 68ch; }
a { color: var(--forest); }
.eyebrow { font-family: var(--sans); font-size: 7.5pt; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
.meta, ul.meta li { font-family: var(--sans); font-size: 8.5pt; color: var(--muted); }
ul.meta { list-style: none; padding: 0; margin: 10pt 0 0; display: grid; gap: 3pt; border-top: 1px solid var(--hair); padding-top: 8pt; }
sup.cite { font-family: var(--sans); font-size: 6.5pt; line-height: 0; margin-left: 1px; }
sup.cite a { text-decoration: none; color: var(--gold); }
.dbl { border: 0; height: 5px; margin: 14pt 0 12pt; background: linear-gradient(var(--forest), var(--forest)) top / 100% 2px no-repeat, linear-gradient(var(--gold), var(--gold)) bottom / 100% 1px no-repeat; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
section.page { break-before: page; }
.cover { min-height: 8.6in; display: flex; flex-direction: column; gap: 14pt; }
.cover .standfirst { font-size: 13pt; line-height: 1.45; max-width: 60ch; }
.tbl { width: 100%; border-collapse: collapse; font-family: var(--sans); font-size: 8.5pt; font-variant-numeric: tabular-nums; margin: 6pt 0 8pt; }
.tbl th { text-align: left; font-weight: 600; color: var(--muted); font-size: 7pt; letter-spacing: .08em; text-transform: uppercase; border-bottom: 1.5px solid var(--forest); padding: 4pt 6pt 4pt 0; }
.tbl td { border-bottom: 1px solid var(--hair); padding: 4pt 6pt 4pt 0; vertical-align: top; }
.tbl tr { break-inside: avoid; }
ul, ol { margin: 0 0 7pt; padding-left: 16pt; }
li { margin: 0 0 3pt; break-inside: avoid; }
.deck { font-style: italic; color: var(--muted); margin-bottom: 8pt; }
.take { background: var(--cream); border-left: 3px solid var(--forest); box-shadow: inset 4px 0 0 var(--cream), inset 5px 0 0 var(--gold); padding: 10pt 14pt 10pt 18pt; margin: 12pt 0; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.take p { font-style: italic; font-size: 11pt; margin: 4pt 0 0; }
.sources .tbl { font-size: 7.2pt; }
.sources .tbl td:nth-child(2) a, .sources code { font-family: var(--mono); font-size: 6.6pt; color: var(--muted); overflow-wrap: anywhere; word-break: break-all; }
.sources p { font-family: var(--sans); font-size: 8.3pt; line-height: 1.45; max-width: none; }
/* Profile: compact two-column first page (docs/templates/profile.md §5). */
.profile h1 { font-size: 22pt; }
.profile .dbl { margin: 8pt 0; }
.profile .grid { display: grid; grid-template-columns: 2.1in 1fr; gap: 0 20pt; }
.profile .grid > * { min-width: 0; }
.profile .idcard .tbl { font-size: 8pt; }
.profile .idcard .tbl th { display: none; }
.profile .idcard .tbl td:first-child { font-size: 7pt; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); width: 0.9in; }
.profile h2 { font-size: 11.5pt; margin-top: 6pt; }
.profile p { font-size: 9.2pt; line-height: 1.4; }
.profile li { font-size: 8.8pt; line-height: 1.35; }
</style>`;

/**
 * Markdown → HTML for a Standard or Profile manuscript (dialect: `:::cover` / `:::take` fences,
 * `## ` sections, `*Claim: …*` decks, pipe tables, lists, [n]/[Sn] markers). A `## Sources…` section
 * starts a new page and gets the Sources styling; in Profiles the first two sections after the cover
 * form the two-column first page.
 */
export function manuscriptToHtml(md, { tier = 'standard', title } = {}) {
  const src = String(md ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/```json[\s\S]*?```/g, '');
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  let mode = null; // 'cover' | 'take' | null
  let sectionOpen = false;
  let sectionIndex = 0;
  let gridOpen = false;
  const closeSection = () => { if (sectionOpen) { out.push('</section>'); sectionOpen = false; } };
  const closeGrid = () => { if (gridOpen) { out.push('</div></div>'); gridOpen = false; } };
  const docTitle = title ?? (src.match(/^#\s+(.+)$/m) ?? [])[1] ?? 'Briefing';
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i += 1; continue; }
    if (l.startsWith(':::')) {
      const kind = l.slice(3).trim();
      if (kind === 'cover') { closeSection(); out.push('<header class="cover">'); mode = 'cover'; }
      else if (kind === 'take') { closeGrid(); closeSection(); out.push('<section class="page take-page"><aside class="take">'); mode = 'take'; }
      else if (mode === 'cover') { out.push('</header>'); mode = null; }
      else if (mode === 'take') { out.push('</aside></section>'); mode = null; }
      i += 1; continue;
    }
    if (l.startsWith('# ')) { out.push(`<p class="eyebrow">Faraday Intelligence · Briefing Library · ${esc(tier)} brief</p><h1>${inline(l.slice(2))}</h1><hr class="dbl">`); i += 1; continue; }
    if (l.startsWith('## ')) {
      const heading = l.slice(3).trim();
      if (mode === 'take') { out.push(`<p class="eyebrow">${inline(heading)}</p>`); i += 1; continue; }
      const isSources = /^sources?\b/i.test(heading);
      sectionIndex += 1;
      if (tier === 'profile') {
        if (sectionIndex === 1) { closeSection(); out.push('<div class="grid"><div class="idcard">'); gridOpen = true; }
        else if (sectionIndex === 2 && gridOpen) { out.push('</div><div class="facts">'); }
        else if (isSources || sectionIndex > 2) closeGrid();
      }
      if (gridOpen) { out.push(`<h2>${inline(heading)}</h2>`); i += 1; continue; }
      closeSection();
      const cls = isSources ? 'page sources' : sectionIndex === 1 && tier !== 'profile' ? 'page' : '';
      out.push(`<section class="${cls}" id="s${sectionIndex}"><hr class="dbl"><h2>${inline(heading)}</h2>`);
      sectionOpen = true; i += 1; continue;
    }
    if (l.startsWith('### ')) { out.push(`<h3>${inline(l.slice(4))}</h3>`); i += 1; continue; }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<table class="tbl"><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr${/^S?\d+$/.test(r[0]) ? ` id="src-${r[0].replace(/^S/, '')}"` : ''}>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^(- |\* |\d+\. )/.test(l)) {
      const ordered = /^\d+\. /.test(l);
      const items = [];
      while (i < lines.length && /^(- |\* |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\* |\d+\. )/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}${mode === 'cover' ? ' class="meta"' : ''}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#|\||- |\* |\d+\. |:::)/.test(lines[i])) para.push(lines[i++]);
    const p = para.join(' ');
    if (/^\*Claim: .*\*$/.test(p)) out.push(`<p class="deck">${inline(p.slice(1, -1))}</p>`);
    else if (mode === 'cover' && out.at(-1)?.includes('</h1>')) out.push(`<p class="standfirst">${inline(p)}</p>`);
    else out.push(`<p>${inline(p)}</p>`);
  }
  closeGrid();
  closeSection();
  if (mode === 'cover') out.push('</header>');
  if (mode === 'take') out.push('</aside></section>');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(docTitle)}</title>${STYLE}</head><body class="${esc(tier)}"><div class="doc">${out.join('\n')}</div></body></html>`;
}

/** Deep tier: the BL-08 renderer of record (scripts/deep-brief/build.mjs). */
export function deepToHtml(md, workDir) {
  mkdirSync(workDir, { recursive: true });
  const mdPath = join(workDir, 'manuscript.md');
  const htmlPath = join(workDir, 'manuscript.html');
  writeFileSync(mdPath, md);
  execFileSync(process.execPath, [join(ROOT, 'scripts/deep-brief/build.mjs'), mdPath, htmlPath], { stdio: 'pipe' });
  return readFileSync(htmlPath, 'utf8');
}

export function countPdfPages(pdfPath) {
  const pdf = readFileSync(pdfPath, 'latin1');
  return (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

/**
 * Render + print + count. Returns { pages, pdf_path, html_path, fonts_loaded, error }.
 * Never throws for render failures: G1 records `pages: null` with the note instead.
 */
export async function measurePages({ manuscript, tier, title, outDir, basename }) {
  const dir = outDir ?? join(tmpdir(), 'bl2-06-review');
  mkdirSync(dir, { recursive: true });
  const name = basename ?? 'draft';
  const htmlPath = join(dir, `${name}.html`);
  const pdfPath = join(dir, `${name}.pdf`);
  try {
    const html = tier === 'deep' ? deepToHtml(manuscript, join(dir, `${name}-deep`)) : manuscriptToHtml(manuscript, { tier, title });
    writeFileSync(htmlPath, html);
    const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family)).catch(() => []);
      await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true });
      return { pages: countPdfPages(pdfPath), pdf_path: pdfPath, html_path: htmlPath, fonts_loaded: [...new Set(fonts)], error: null };
    } finally {
      await browser.close();
    }
  } catch (e) {
    return { pages: null, pdf_path: existsSync(pdfPath) ? pdfPath : null, html_path: existsSync(htmlPath) ? htmlPath : null, fonts_loaded: [], error: String(e?.message ?? e) };
  }
}
