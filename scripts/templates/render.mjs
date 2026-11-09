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

import { STYLE } from './styles.mjs';

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

// BL2-05 (FDY-281): render generated manuscripts (Markdown) instead of the sample data files.
//   node scripts/templates/render.mjs --manuscript <file.md|dir> [--tier deep|standard|profile] [--out <dir>] [--html]
// The tier is read from the manuscript's cover ("- **Tier:** Deep brief" / "Standard …" / "Profile …")
// unless --tier is given. Prints "<tier> <pp> pp <range> <IN|OUT>  <file>" per manuscript.
const mArg = process.argv.indexOf('--manuscript');
if (mArg > -1) {
  const { renderManuscript, createPageCounter, PAGE_RANGE, inRange } = await import('./manuscript.mjs');
  const { statSync } = await import('node:fs');
  const target = process.argv[mArg + 1];
  if (!target) throw new Error('--manuscript needs a file or directory');
  const outArg = process.argv.indexOf('--out');
  const outDir = outArg > -1 ? process.argv[outArg + 1] : dirname(target);
  const tierArg = process.argv.indexOf('--tier');
  const forcedTier = tierArg > -1 ? process.argv[tierArg + 1] : null;
  const list = statSync(target).isDirectory() ? readdirSync(target).filter((f) => f.endsWith('.md')).sort().map((f) => join(target, f)) : [target];
  mkdirSync(outDir, { recursive: true });
  const tierOf = (mdText) => forcedTier ?? (/\*\*Tier:\*\* Deep/i.test(mdText) ? 'deep' : /\*\*Tier:\*\* Profile/i.test(mdText) ? 'profile' : 'standard');
  const htmlOnly = process.argv.includes('--html');
  const counter = htmlOnly ? null : await createPageCounter({ pdfDir: PDF_DIR });
  if (!htmlOnly) mkdirSync(PDF_DIR, { recursive: true });
  for (const f of list) {
    const mdText = readFileSync(f, 'utf8');
    const tier = tierOf(mdText);
    const html = renderManuscript(mdText, tier);
    const slug = f.split('/').pop().replace(/\.md$/, '');
    writeFileSync(join(outDir, `${slug}.html`), html);
    if (htmlOnly) {
      console.log(`html  ${tier.padEnd(8)} ${slug}`);
      continue;
    }
    const r = await counter.count(html, { name: slug });
    const [lo, hi] = PAGE_RANGE[tier];
    console.log(`${tier.padEnd(8)} ${String(r.pages).padStart(2)} pp  range ${lo}-${hi}  ${inRange(r.pages, tier) ? 'IN ' : 'OUT'}  fonts=${r.fontsLoaded}  ${slug}  ${r.pdf}`);
  }
  if (counter) await counter.close();
  process.exit(0);
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
