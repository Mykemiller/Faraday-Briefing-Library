// BL-09 (FDY-175): render Standard and Profile briefing samples to HTML, then to PDF,
// and count pages.
//
//   node scripts/templates/render.mjs            # HTML + PDF for every data file, prints page counts
//   node scripts/templates/render.mjs --html     # HTML only
//
// Input:  docs/templates/samples/data/*.json   (one briefing per file; schema in docs/templates/*.md)
// Output: docs/templates/samples/<slug>.html   (committed)
//         <tmpdir>/bl09-pdf/<slug>.pdf         (NOT committed; PDFs are generated, never checked in)
//
// Page-count method (recorded in docs/templates/test-results.md):
//   Chromium (Playwright) at /opt/pw-browsers, page.pdf({ format: 'Letter' }) with no margin
//   override, so the page box and margins come from the template's own @page rule. Fonts are
//   awaited (document.fonts.ready) before printing. Pages are counted from the PDF's /Type /Page
//   objects.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'docs/templates/samples/data');
const OUT = join(ROOT, 'docs/templates/samples');
const PDF_DIR = join(process.env.BL09_PDF_DIR || tmpdir(), 'bl09-pdf');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// "[3]" or "[3, 7]" in prose -> superscript citation links to the Sources page.
const cite = (s) => esc(s).replace(/\[(\d+(?:,\s*\d+)*)\]/g, (_, ns) =>
  `<sup class="cite">${ns.split(/,\s*/).map((n) => `<a href="#src-${n}">${n}</a>`).join(',')}</sup>`);
const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const STYLE = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a printed briefing. One column of Letter pages; the cover and the Sources page each start a page. */
/* Single light "paper" look by design (it is a print document), so colours are set explicitly and no dark block is defined. */
:root {
  color-scheme: light;
  --paper: #fbfbf8;      /* page ground */
  --ink: #1b211d;        /* body text */
  --muted: #5a645c;      /* captions, metadata */
  --forest: #1f4a36;     /* Faraday forest: headings, upper rule */
  --gold: #a8812f;       /* Faraday gold: lower rule, eyebrows */
  --cream: #f6efdc;      /* Faraday's Take callout only (Brand Bible §06) */
  --hair: #d5dbd3;       /* table and list hairlines */
  --serif: "Source Serif 4", Georgia, "DejaVu Serif", serif;
  --sans: "IBM Plex Sans", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif;
  --mono: "IBM Plex Mono", "DejaVu Sans Mono", monospace;
}
@page { size: Letter; margin: 0.7in 0.75in 0.75in; }
html { background: var(--paper); }
body { background: var(--paper); color: var(--ink); font-family: var(--serif); font-size: 10.5pt; line-height: 1.5; margin: 0; padding-inline: 16px; padding-block: 24px; }
.doc { max-width: 7in; margin: 0 auto; }
@media print { body { padding: 0; } .doc { max-width: none; } }
h1, h2, h3 { font-family: var(--serif); color: var(--forest); text-wrap: balance; margin: 0; }
h1 { font-size: 26pt; line-height: 1.12; font-weight: 700; }
h2 { font-size: 15pt; line-height: 1.25; font-weight: 600; margin-top: 4pt; }
h3 { font-size: 11pt; font-weight: 600; color: var(--ink); }
p { margin: 0 0 7pt; max-width: 68ch; }
a { color: var(--forest); }
.eyebrow { font-family: var(--sans); font-size: 7.5pt; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
.meta { font-family: var(--sans); font-size: 8.5pt; color: var(--muted); }
.mono { font-family: var(--mono); font-size: 8pt; }
sup.cite { font-family: var(--sans); font-size: 6.5pt; line-height: 0; margin-left: 1px; }
sup.cite a { text-decoration: none; color: var(--gold); }
/* Faraday editorial signature: double rule, forest over gold (Brand Bible §06). */
.dbl { border: 0; height: 5px; margin: 14pt 0 12pt; background:
  linear-gradient(var(--forest), var(--forest)) top / 100% 2px no-repeat,
  linear-gradient(var(--gold), var(--gold)) bottom / 100% 1px no-repeat; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { break-before: page; }
section { margin-top: 4pt; }
/* Cover */
.cover { min-height: 8.6in; display: flex; flex-direction: column; gap: 14pt; }
.cover .tierline { display: flex; flex-wrap: wrap; gap: 6pt 18pt; font-family: var(--sans); font-size: 8.5pt; color: var(--muted); }
.cover .thesis { font-size: 13pt; line-height: 1.45; max-width: 60ch; }
.cover .foot { margin-top: auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10pt; border-top: 1px solid var(--hair); padding-top: 10pt; }
.kv dt { font-family: var(--sans); font-size: 7pt; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.kv dd { margin: 1pt 0 0; font-family: var(--sans); font-size: 9pt; }
/* Tables */
.tbl { width: 100%; border-collapse: collapse; font-family: var(--sans); font-size: 8.5pt; font-variant-numeric: tabular-nums; margin: 6pt 0 8pt; }
.tbl th { text-align: left; font-weight: 600; color: var(--muted); font-size: 7pt; letter-spacing: .08em; text-transform: uppercase; border-bottom: 1.5px solid var(--forest); padding: 4pt 6pt 4pt 0; }
.tbl td { border-bottom: 1px solid var(--hair); padding: 4pt 6pt 4pt 0; vertical-align: top; }
.tbl tr { break-inside: avoid; }
.tbl td.num { white-space: nowrap; font-weight: 600; color: var(--forest); }
/* Signal entries */
.sig { display: grid; grid-template-columns: 0.95in 1fr; gap: 0 12pt; padding: 6pt 0; border-bottom: 1px solid var(--hair); break-inside: avoid; }
.sig .when { font-family: var(--sans); font-size: 8pt; color: var(--muted); }
.sig .when b { display: block; color: var(--ink); font-weight: 500; }
.sig h3 { margin-bottom: 2pt; }
.sig p { margin: 0; }
.thread-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4pt 10pt; }
.code { font-family: var(--mono); font-size: 8pt; color: var(--gold); }
.intro { color: var(--ink); break-after: avoid; }
h2, .thread-head { break-after: avoid; }
/* Faraday's Take: cream ground, forest/gold double left rule, italic serif (Brand Bible §06). */
.take { background: var(--cream); border-left: 3px solid var(--forest); box-shadow: inset 4px 0 0 var(--cream), inset 5px 0 0 var(--gold); padding: 10pt 14pt 10pt 18pt; margin: 12pt 0; break-inside: avoid; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.take .eyebrow { color: var(--forest); }
.take p { font-style: italic; font-size: 11pt; margin: 4pt 0 0; }
/* Sources */
ol.sources { list-style: none; padding: 0; margin: 6pt 0 0; font-family: var(--sans); font-size: 7.2pt; line-height: 1.3; columns: 2; column-gap: 16pt; }
@media (max-width: 560px) { ol.sources { columns: 1; } }
ol.sources li { display: grid; grid-template-columns: 22pt 1fr; padding: 2.5pt 0; border-bottom: 1px solid var(--hair); break-inside: avoid; }
ol.sources .n { color: var(--gold); font-weight: 600; }
ol.sources .u { font-family: var(--mono); font-size: 6.6pt; color: var(--muted); overflow-wrap: anywhere; word-break: break-all; }
.method p, .method li { font-family: var(--sans); font-size: 8.3pt; line-height: 1.45; max-width: none; }
.method ul { margin: 2pt 0 6pt; padding-left: 14pt; }
/* Profile */
.profile-grid { display: grid; grid-template-columns: 2.1in 1fr; gap: 0 20pt; }
.profile-grid > * { min-width: 0; }
.idcard { border-top: 2px solid var(--forest); padding-top: 6pt; }
.idcard dl { margin: 0; display: grid; gap: 6pt; }
.src-tag { font-family: var(--mono); font-size: 6.6pt; color: var(--muted); display: block; margin-top: 1pt; overflow-wrap: anywhere; }
.compact .sig { grid-template-columns: 0.8in 1fr; padding: 3pt 0; }
.profile h1 { font-size: 22pt; }
.profile .dbl { margin: 8pt 0 8pt; }
.compact .sig h3 { font-size: 9.5pt; }
.compact .sig p { font-size: 8.8pt; line-height: 1.35; }
@media (max-width: 560px) {
  .profile-grid { grid-template-columns: 1fr; }
  .sig, .compact .sig { grid-template-columns: 1fr; }
  h1 { font-size: 21pt; }
}
</style>`;

function header(b) {
  return `<title>${esc(b.title)}</title>\n${STYLE}\n<div class="doc">`;
}

function sourcesPage(b, { heading = 'Sources & methodology', page = true } = {}) {
  const items = b.sources.map((s) => `<li id="src-${s.n}"><span class="n">${s.n}</span><span><b>${esc(s.pub)}</b> · ${fmtDate(s.d)} · ${esc(s.title)}<br><span class="u">${esc(s.url)}</span> <span class="u">· ${esc(s.ref)}</span></span></li>`).join('\n');
  return `<section class="${page ? 'page ' : ''}method" id="sources">
<div class="eyebrow">${esc(b.kicker)} · Final page</div>
<h2>${esc(heading)}</h2>
<hr class="dbl">
${b.method.map((p) => `<p>${cite(p)}</p>`).join('\n')}
<ol class="sources">${items}</ol>
</section>`;
}

function standard(b) {
  const r = b.record;
  const cover = `<section class="cover">
<div class="eyebrow">Faraday Briefing Library · ${esc(b.kicker)}</div>
<div class="tierline"><span>Tier: Standard (${esc(r.page_target)} pp target)</span><span>Theater: ${esc(b.theater)}</span><span>Sector: ${esc(b.sectors.join(' · '))}</span></div>
<h1>${esc(b.title)}</h1>
<hr class="dbl">
<p class="thesis">${cite(b.thesis_lead)}</p>
<p class="meta">By ${esc(b.byline)} · Evidence window ${fmtDate(b.window[0])} to ${fmtDate(b.window[1])} · Status: ${esc(r.status)} (not signed off)</p>
<dl class="foot kv">
  <div><dt>Threads covered</dt><dd>${b.sections.map((s) => esc(s.code)).join(', ')}</dd></div>
  <div><dt>Signals cited</dt><dd>${b.sources.length}</dd></div>
  <div><dt>Library record</dt><dd class="mono">${esc(r.airtable_record_id)} · #${esc(r.airtable_autonumber)}</dd></div>
  <div><dt>Prepared</dt><dd>${fmtDate(b.prepared)}</dd></div>
</dl>
</section>`;

  const summary = `<section class="page" id="summary">
<div class="eyebrow">The argument</div>
<h2>${esc(b.summary_heading)}</h2>
<hr class="dbl">
${b.thesis.map((p) => `<p>${cite(p)}</p>`).join('\n')}
<h3 style="margin-top:10pt">At a glance</h3>
<table class="tbl"><thead><tr><th style="width:22%">Figure</th><th>What the record shows</th><th style="width:16%">Date</th></tr></thead><tbody>
${b.glance.map((g) => `<tr><td class="num">${esc(g.figure)}</td><td>${cite(g.text)}</td><td>${fmtDate(g.d)}</td></tr>`).join('\n')}
</tbody></table>
</section>`;

  const threads = b.sections.map((s, i) => `<section class="${s.break ? 'page' : ''}" id="t-${i}">
${s.break ? '' : '<hr class="dbl">'}
<div class="thread-head"><span class="eyebrow">Thread</span><span class="code">${esc(s.code)}</span></div>
<h2>${esc(s.name)}</h2>
${s.break ? '<hr class="dbl">' : ''}
<p class="intro">${cite(s.intro)}</p>
${s.items.map((it) => `<div class="sig"><div class="when"><b>${fmtDate(it.d)}</b>${esc(it.pub)}</div><div><h3>${esc(it.head)}</h3><p>${cite(it.text)}</p></div></div>`).join('\n')}
</section>`).join('\n');

  const take = `<div class="take"><div class="eyebrow">Faraday's Take</div><p>${cite(b.take)}</p></div>`;

  const register = `<section class="page" id="register">
<div class="eyebrow">Signal register</div>
<h2>Named parties in the record</h2>
<hr class="dbl">
<p>${cite(b.register_intro)}</p>
<table class="tbl"><thead><tr><th style="width:26%">Party</th><th>Role in the cited Signals</th><th style="width:12%">Sources</th></tr></thead><tbody>
${b.register.map((g) => `<tr><td><b>${esc(g.party)}</b></td><td>${esc(g.role)}</td><td>${cite('[' + g.cites.join(', ') + ']')}</td></tr>`).join('\n')}
</tbody></table>
${take}
</section>`;

  return `${header(b)}\n${cover}\n${summary}\n${threads}\n${register}\n${sourcesPage(b)}\n</div>\n`;
}

function profile(b) {
  const id = b.identity.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${cite(x.value)}</dd></div>`).join('\n');
  const tags = b.tags.map((x) => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.value)}<span class="src-tag">${esc(x.src)}</span></dd></div>`).join('\n');
  return `${header(b)}
<section class="profile">
<div class="eyebrow">Faraday Briefing Library · ${esc(b.kicker)}</div>
<h1 style="margin-top:4pt">${esc(b.title)}</h1>
<p class="meta" style="margin-top:4pt">Tier: Profile (2 pp) · Sourced facts only · Status: ${esc(b.record.status)} (not signed off) · Prepared ${fmtDate(b.prepared)} · Record ${esc(b.record.airtable_record_id)}</p>
<hr class="dbl">
<div class="profile-grid">
<aside class="idcard"><dl class="kv">
${id}
${tags}
</dl></aside>
<div class="compact">
<div class="eyebrow">What the record shows</div>
<p style="margin-top:3pt">${cite(b.lead)}</p>
<h2 style="margin-top:8pt">Dated Signals</h2>
${b.items.map((it) => `<div class="sig"><div class="when"><b>${fmtDate(it.d)}</b>${esc(it.pub)}</div><div><h3>${esc(it.head)}</h3><p>${cite(it.text)}</p></div></div>`).join('\n')}
</div>
</div>
</section>
${sourcesPage(b, { heading: 'Sources & method', page: b.sources_page_break !== false })}
</div>
`;
}

const files = readdirSync(DATA).filter((f) => f.endsWith('.json')).sort();
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
const built = [];
for (const f of files) {
  const b = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
  if (only && b.slug !== only) continue;
  const html = b.tier === 'profile' ? profile(b) : standard(b);
  const out = join(OUT, `${b.slug}.html`);
  writeFileSync(out, html);
  built.push({ slug: b.slug, tier: b.tier, title: b.title, out });
}

if (process.argv.includes('--html')) {
  for (const x of built) console.log(`html  ${x.slug}`);
  process.exit(0);
}

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node-tools/node_modules/playwright/index.mjs');
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(PDF_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath });
const results = [];
for (const x of built) {
  const page = await browser.newPage();
  await page.goto('file://' + x.out, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await Promise.all(['400 10pt "Source Serif 4"', 'italic 400 10pt "Source Serif 4"', '600 10pt "Source Serif 4"', '700 10pt "Source Serif 4"',
      '400 10pt "IBM Plex Sans"', '600 10pt "IBM Plex Sans"', '400 10pt "IBM Plex Mono"'].map((f) => document.fonts.load(f)));
    await document.fonts.ready;
  });
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length);
  const pdfPath = join(PDF_DIR, `${x.slug}.pdf`);
  const buf = await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true });
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
  results.push({ slug: x.slug, tier: x.tier, pages, fontsLoaded: fonts, pdf: pdfPath });
  await page.close();
}
await browser.close();
for (const r of results) console.log(`${r.tier.padEnd(8)} ${String(r.pages).padStart(2)} pp  fonts=${r.fontsLoaded}  ${r.slug}  ${r.pdf}`);
