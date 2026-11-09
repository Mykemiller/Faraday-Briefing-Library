// BL2-05 (FDY-281): render a generated manuscript (Markdown, the artifact of record) to the tier's
// printed HTML, and count the pages of its Letter PDF.
//
//   import { renderManuscript, createPageCounter } from './manuscript.mjs';
//   const html = renderManuscript(markdown, 'standard');          // deep | standard | profile
//   const counter = await createPageCounter();                      // Playwright + Chromium
//   const { pages, fontsLoaded } = await counter.count(html);       // from the PDF's /Type /Page objects
//   await counter.close();
//
// Manuscript conventions (written by scripts/lanes/compose.mjs):
//   :::cover … :::     cover block: "# Title", a deck paragraph, "- **Key:** value" meta lines
//   ## Heading          top-level part (Deep: every part prints on a new page; Standard: the argument,
//                       the first Thread, the Signal register and Sources start pages; Profile: Sources only)
//   ### Headline        a dated Signal entry, followed by "*Date · Publisher*" and its paragraph
//   :::take … :::      Faraday's Take (cream panel, forest/gold double left rule, italic serif)
//   | … | tables, numbered/bulleted lists, **bold**, *italic*, [text](url), [Sn] markers
//   ```json source_refs …``` the BL-03 jsonb, embedded as a non-printing <script type="application/json">
//
// Page-count method is the BL-09 one (docs/templates/test-results.md): page.pdf({ format: 'Letter',
// printBackground: true }) with no margin override, so the template's own @page rule applies; fonts
// are awaited (bounded) before printing.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLE } from './styles.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEEP_SHELL = join(HERE, '..', 'deep-brief', 'shell.html');

export const PAGE_RANGE = Object.freeze({ deep: [10, 15], standard: [8, 10], profile: [2, 2] });

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (d) => {
  const t = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? esc(d) : t.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** Inline Markdown → HTML: markers, links, bold, italic, code. */
export function inline(s) {
  return esc(s)
    .replace(/\[(S\d+)\](?!\()/g, '<a class="ref cite" href="#src-$1">$1</a>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\\\|/g, '|');
}

// ---------------------------------------------------------------------------------------------
// Parser: Markdown → block tree
// ---------------------------------------------------------------------------------------------

export function parseManuscript(mdText) {
  // HTML comments (the --emit header, editorial notes) are not content.
  const lines = String(mdText).replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const doc = { cover: null, parts: [], take: null, json: null };
  let i = 0;
  const peek = () => lines[i];

  function readBlocks(stop) {
    const blocks = [];
    let para = [];
    const flush = () => {
      if (para.length) {
        blocks.push({ type: 'p', text: para.join(' ') });
        para = [];
      }
    };
    while (i < lines.length) {
      const l = lines[i];
      if (stop(l)) break;
      if (!l.trim()) {
        flush();
        i += 1;
        continue;
      }
      if (l.startsWith('```')) {
        flush();
        const fence = l.slice(3).trim();
        i += 1;
        const buf = [];
        while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
        i += 1;
        if (/^json/.test(fence)) doc.json = buf.join('\n');
        else blocks.push({ type: 'code', text: buf.join('\n') });
        continue;
      }
      if (l.startsWith('### ')) {
        flush();
        const head = l.slice(4).trim();
        i += 1;
        let when = null;
        if (i < lines.length && /^\*[^*]+·[^*]+\*$/.test(lines[i].trim())) {
          const [d, pub] = lines[i].trim().slice(1, -1).split('·').map((x) => x.trim());
          when = { date: d, publisher: pub };
          i += 1;
        }
        const body = [];
        while (i < lines.length && lines[i].trim() && !/^(#{2,3} |\||:::|```|- |\d+\. )/.test(lines[i])) body.push(lines[i++]);
        blocks.push({ type: 'entry', head, when, text: body.join(' ') });
        continue;
      }
      if (l.startsWith('|')) {
        flush();
        const rows = [];
        while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
        blocks.push({ type: 'table', head: cells(rows[0]), rows: rows.slice(2).map(cells) });
        continue;
      }
      if (/^(- |\d+\. )/.test(l)) {
        flush();
        const ordered = /^\d+\. /.test(l);
        const items = [];
        while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/, ''));
        blocks.push({ type: ordered ? 'ol' : 'ul', items });
        continue;
      }
      para.push(l.trim());
      i += 1;
    }
    flush();
    return blocks;
  }

  while (i < lines.length) {
    const l = peek();
    if (l.startsWith(':::cover')) {
      i += 1;
      const blocks = readBlocks((x) => x.trim() === ':::');
      i += 1;
      const title = lines.slice(0, i).find((x) => x.startsWith('# '))?.slice(2).trim() ?? '';
      doc.cover = { title, blocks: blocks.filter((b) => !(b.type === 'p' && b.text.startsWith('# '))) };
      continue;
    }
    if (l.startsWith(':::take')) {
      i += 1;
      const inner = [];
      while (i < lines.length && lines[i].trim() !== ':::') inner.push(lines[i++]);
      i += 1;
      const heading = inner.find((x) => x.startsWith('## '))?.slice(3).trim() ?? "Faraday's Take";
      const saved = i;
      const sub = inner.filter((x) => !x.startsWith('## ')).join('\n');
      const subDoc = parseManuscript(sub);
      i = saved;
      doc.take = { heading, blocks: subDoc.parts[0]?.blocks ?? [] };
      continue;
    }
    if (l.startsWith('## ')) {
      const heading = l.slice(3).trim();
      i += 1;
      const blocks = readBlocks((x) => x.startsWith('## ') || x.startsWith(':::'));
      doc.parts.push({ heading, blocks });
      continue;
    }
    // Loose text before any heading (used when parsing the Take's inner body). Blank lines are
    // consumed by readBlocks; only advance by hand when it made no progress at all.
    const before = i;
    const blocks = readBlocks((x) => x.startsWith('## ') || x.startsWith(':::'));
    if (blocks.length) doc.parts.push({ heading: null, blocks });
    else if (i === before) i += 1;
  }
  return doc;
}

// ---------------------------------------------------------------------------------------------
// HTML emitters
// ---------------------------------------------------------------------------------------------

function blockHtml(b, { entryClass = 'sig' } = {}) {
  switch (b.type) {
    case 'p':
      if (/^\*Claim: .*\*$/.test(b.text)) return `<p class="deck intro">${inline(b.text.slice(8, -1))}</p>`;
      if (/^\*— .*\*$/.test(b.text)) return `<p class="sig-line">${inline(b.text.slice(1, -1))}</p>`;
      return `<p>${inline(b.text)}</p>`;
    case 'entry':
      return `<div class="${entryClass}"><div class="when"><b>${b.when ? fmtDate(b.when.date) : ''}</b>${esc(b.when?.publisher ?? '')}</div><div><h3>${inline(b.head)}</h3><p>${inline(b.text)}</p></div></div>`;
    case 'table':
      return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${b.head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${b.rows
        .map((r) => `<tr>${r.map((c, k) => `<td${k === 0 && /^[\d$€£]/.test(c) ? ' class="num"' : ''}>${inline(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>`;
    case 'ol':
      return `<ol>${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`;
    case 'ul':
      return `<ul>${b.items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`;
    case 'code':
      return `<pre><code>${esc(b.text)}</code></pre>`;
    default:
      return '';
  }
}

/** The Sources part: its table becomes the numbered source list, prose becomes the method note. */
function sourcesHtml(part, { page = true, eyebrow }) {
  const table = part.blocks.find((b) => b.type === 'table');
  const prose = part.blocks.filter((b) => b.type !== 'table');
  const items = (table?.rows ?? [])
    .map((r) => {
      const ref = r[0];
      const m = r[1].match(/^\[([^\]]+)\]\((https?:[^)\s]+)\)$/);
      const title = m ? m[1] : r[1];
      const url = m ? m[2] : '';
      return `<li id="src-${esc(ref)}"><span class="n">${esc(ref)}</span><span><b>${esc(r[2])}</b>${r[3] ? ` · ${esc(r[3])}` : ''} · ${inline(title)}<br><span class="u">${esc(url)}</span>${r[4] ? ` <span class="u">· ${esc(r[4])}</span>` : ''}</span></li>`;
    })
    .join('\n');
  return `<section class="${page ? 'page part ' : ''}method sources-part" id="sources">
${eyebrow ? `<div class="eyebrow">${esc(eyebrow)} · Final page</div>` : ''}
<div class="rule" aria-hidden="true"></div>
<h2>${inline(part.heading)}</h2>
<hr class="dbl">
${prose.map((b) => blockHtml(b)).join('\n')}
<ol class="sources">${items}</ol>
</section>`;
}

const coverMeta = (cover) => {
  const list = cover.blocks.find((b) => b.type === 'ul');
  return (list?.items ?? []).map((x) => {
    const m = x.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    return m ? { label: m[1], value: m[2] } : { label: '', value: x };
  });
};

function renderDeep(doc) {
  const shell = readFileSync(DEEP_SHELL, 'utf8').replace(/<title>[^<]*<\/title>/, `<title>${esc(doc.cover?.title ?? 'Deep brief')}</title>`);
  const meta = coverMeta(doc.cover ?? { blocks: [] });
  const deck = (doc.cover?.blocks ?? []).find((b) => b.type === 'p');
  const out = [];
  out.push(`<header class="cover"><p class="eyebrow">Faraday Intelligence · Briefing Library · Deep brief</p><h1>${inline(doc.cover?.title ?? '')}</h1>`);
  if (deck) out.push(`<p class="standfirst">${inline(deck.text)}</p>`);
  out.push(`<ul class="meta">${meta.map((m) => `<li><strong>${esc(m.label)}</strong>${inline(m.value)}</li>`).join('')}</ul></header>`);
  let n = 0;
  for (const part of doc.parts) {
    if (/^Sources & method/.test(part.heading)) {
      out.push(sourcesHtml(part, { page: true }));
      continue;
    }
    const m = part.heading.match(/^(\d+)\.\s+(.*)$/);
    out.push(`<section class="part" id="part-${++n}"><div class="rule" aria-hidden="true"></div>`);
    out.push(m ? `<h2><span class="num">${m[1]}</span>${inline(m[2])}</h2>` : `<h2>${inline(part.heading)}</h2>`);
    out.push(part.blocks.map((b) => blockHtml(b, { entryClass: 'sig deep-sig' })).join('\n'));
    out.push('</section>');
    if (/^Signals to watch/.test(part.heading) && doc.take) {
      out.push(`<section class="part take-page" id="take"><aside class="take"><h2>${inline(doc.take.heading)}</h2>${doc.take.blocks.map((b) => blockHtml(b)).join('\n')}</aside></section>`);
    }
  }
  const extra = `<style>
p{orphans:3;widows:3}
.sig{display:grid;grid-template-columns:7.2rem 1fr;gap:0 1rem;padding:.55rem 0;border-bottom:1px solid var(--line);break-inside:avoid}
.sig .when{font-family:var(--f-util);font-size:.8rem;color:var(--muted)}.sig .when b{display:block;color:var(--ink);font-weight:600}
.sig h3{font-size:1.02rem;line-height:1.3;margin:0 0 .25rem}.sig p{margin:0;max-width:none}
.tbl-wrap{overflow-x:auto;margin:0 0 1.2rem;break-inside:avoid}.tbl td.num{white-space:nowrap;font-weight:600;color:var(--forest)}
hr.dbl{display:none}.sources-part .eyebrow{display:none}
ol.sources{list-style:none;padding:0;margin:.6rem 0 0;font-family:var(--f-util);font-size:.78rem;line-height:1.3;columns:2;column-gap:1rem}
ol.sources li{display:grid;grid-template-columns:2rem 1fr;padding:.2rem 0;border-bottom:1px solid var(--line);break-inside:avoid}
ol.sources .n{color:var(--gold);font-weight:600}ol.sources .u{font-size:.7rem;color:var(--muted);overflow-wrap:anywhere;word-break:break-all}
.sig-line{font-style:normal;font-family:var(--f-util);font-size:.85rem;letter-spacing:.04em;color:var(--forest);margin-top:1rem}
@media print{.sig{padding:.35rem 0}.sig h3{font-size:.95rem}}
</style>`;
  const json = doc.json ? `<script type="application/json" id="source-refs">${doc.json.replace(/<\/script/gi, '<\\/script')}</script>` : '';
  return shell.replace('<!--BODY-->', `${out.join('\n')}\n${extra}`).replace('<!--JSON-->', json);
}

const STD_EXTRA = `<style>
p{orphans:3;widows:3}
h2,h3,.eyebrow,.intro{break-after:avoid}
.sig{break-inside:avoid}
.cover-meta{margin-top:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10pt;border-top:1px solid var(--hair);padding-top:10pt}
.rule{display:none}
.part + .part{margin-top:10pt}
.take .sig-line{font-style:normal;font-family:var(--sans);font-size:8.5pt;letter-spacing:.04em;color:var(--forest);margin-top:6pt}
.identity dl{margin:0;display:grid;gap:6pt}
.profile-grid h2{font-size:12pt}
.compact .sig p{font-size:8.8pt;line-height:1.35}
.identity .shows p{font-size:8.6pt;line-height:1.4;margin:3pt 0 0}
.compact .sig h3{font-size:9.2pt;line-height:1.25}
.tbl-wrap{margin:6pt 0 8pt}
</style>`;

function renderStandard(doc) {
  const meta = coverMeta(doc.cover ?? { blocks: [] });
  const get = (k) => meta.find((m) => m.label.toLowerCase() === k)?.value ?? '';
  const deck = (doc.cover?.blocks ?? []).find((b) => b.type === 'p');
  const kicker = get('kicker') || 'Library · Briefing';
  const out = [`<title>${esc(doc.cover?.title ?? '')}</title>`, STYLE, STD_EXTRA, '<div class="doc">'];
  out.push(`<section class="cover">
<div class="eyebrow">Faraday Briefing Library · ${esc(kicker.replace(/^Library · /, ''))}</div>
<div class="tierline"><span>Tier: ${inline(get('tier'))}</span><span>${inline(get('coverage'))}</span></div>
<h1>${inline(doc.cover?.title ?? '')}</h1>
<hr class="dbl">
${deck ? `<p class="thesis">${inline(deck.text)}</p>` : ''}
<p class="meta">By ${inline(get('byline'))} · Evidence window ${inline(get('evidence window'))} · Status: ${inline(get('status'))}</p>
<dl class="cover-meta kv">${meta
    .filter((m) => !['kicker', 'tier', 'coverage', 'byline', 'evidence window', 'status'].includes(m.label.toLowerCase()))
    .map((m) => `<div><dt>${esc(m.label)}</dt><dd class="mono">${inline(m.value)}</dd></div>`)
    .join('')}</dl>
</section>`);
  let threadIndex = 0;
  for (const part of doc.parts) {
    if (/^Sources & method/.test(part.heading)) {
      out.push(sourcesHtml(part, { page: true, eyebrow: kicker.replace(/^Library · /, '') }));
      continue;
    }
    const isArgument = /^The argument/.test(part.heading);
    const isRegister = /^Signal register/.test(part.heading);
    const isThread = !isArgument && !isRegister;
    if (isThread) threadIndex += 1;
    const page = isArgument || isRegister || threadIndex === 1;
    const eyebrow = isArgument ? 'The argument' : isRegister ? 'Signal register' : 'Thread';
    out.push(`<section class="${page ? 'page ' : ''}part">${page ? '' : '<hr class="dbl">'}<div class="eyebrow">${eyebrow}</div><h2>${inline(part.heading)}</h2>${page ? '<hr class="dbl">' : ''}`);
    out.push(part.blocks.map((b) => blockHtml(b)).join('\n'));
    if (isRegister && doc.take) out.push(`<div class="take"><div class="eyebrow">${inline(doc.take.heading)}</div>${doc.take.blocks.map((b) => blockHtml(b)).join('\n')}</div>`);
    out.push('</section>');
  }
  out.push('</div>');
  return out.join('\n');
}

function renderProfile(doc) {
  const meta = coverMeta(doc.cover ?? { blocks: [] });
  const get = (k) => meta.find((m) => m.label.toLowerCase() === k)?.value ?? '';
  const kicker = (get('kicker') || 'Library · Company Briefing').replace(/^Library · /, '');
  const identity = doc.parts.find((p) => /^Identity card/.test(p.heading));
  const shows = doc.parts.find((p) => /^What the record shows/.test(p.heading));
  const dated = doc.parts.find((p) => /^Dated Signals/.test(p.heading));
  const sources = doc.parts.find((p) => /^Sources & method/.test(p.heading));
  const idItems = (identity?.blocks.find((b) => b.type === 'ul')?.items ?? []).map((x) => {
    const m = x.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    return m ? `<div><dt>${esc(m[1])}</dt><dd>${inline(m[2])}</dd></div>` : `<div><dd>${inline(x)}</dd></div>`;
  });
  const out = [`<title>${esc(doc.cover?.title ?? '')}</title>`, STYLE, STD_EXTRA, '<div class="doc">'];
  out.push(`<section class="profile">
<div class="eyebrow">Faraday Briefing Library · ${esc(kicker)}</div>
<h1 style="margin-top:4pt">${inline(doc.cover?.title ?? '')}</h1>
<p class="meta" style="margin-top:4pt">Tier: ${inline(get('tier'))} · Status: ${inline(get('status'))} · ${inline(get('record'))} · Evidence window ${inline(get('evidence window'))}</p>
<hr class="dbl">
<div class="profile-grid">
<aside class="idcard identity"><dl class="kv">${idItems.join('\n')}</dl>
<div class="eyebrow" style="margin-top:10pt">What the record shows</div>
<div class="shows">${(shows?.blocks ?? []).map((b) => blockHtml(b)).join('\n')}</div></aside>
<div class="compact">
<h2>Dated Signals</h2>
${(dated?.blocks ?? []).map((b) => blockHtml(b)).join('\n')}
</div>
</div>
</section>`);
  if (sources) out.push(sourcesHtml(sources, { page: true, eyebrow: kicker }));
  out.push('</div>');
  return out.join('\n');
}

/** Markdown manuscript → full HTML document for the tier. */
export function renderManuscript(mdText, tier) {
  const doc = parseManuscript(mdText);
  if (tier === 'deep') return renderDeep(doc);
  if (tier === 'profile') return renderProfile(doc);
  return renderStandard(doc);
}

// ---------------------------------------------------------------------------------------------
// Page counting (Playwright + the pre-installed Chromium)
// ---------------------------------------------------------------------------------------------

export function countPdfPages(buffer) {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
}

/**
 * One browser for many counts. Fonts are awaited for at most `fontTimeoutMs`; if Google Fonts are
 * unreachable the fallback stack prints and `fontsLoaded` says so (counts can rise by a page).
 */
export async function createPageCounter({ fontTimeoutMs = 8000, pdfDir = null } = {}) {
  // Playwright is resolved through CommonJS (NODE_PATH-aware), so the pre-installed copy is found
  // from any directory; PLAYWRIGHT_MODULE / PLAYWRIGHT_PATH override it (BL-09 convention).
  let chromium;
  try {
    const req = createRequire(import.meta.url);
    ({ chromium } = req(process.env.PLAYWRIGHT_MODULE || process.env.PLAYWRIGHT_PATH || 'playwright'));
  } catch (e) {
    throw new Error(`playwright is not available (${e.message}); set PLAYWRIGHT_MODULE or install playwright`);
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  return {
    async count(html, { name = null } = {}) {
      const page = await browser.newPage();
      try {
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${html}</body></html>`, { waitUntil: 'load', timeout: 30000 });
        await page.evaluate((ms) => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ms))]), fontTimeoutMs).catch(() => {});
        const fontsLoaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length).catch(() => 0);
        const opts = { format: 'Letter', printBackground: true };
        if (pdfDir && name) opts.path = join(pdfDir, `${name}.pdf`);
        const buf = await page.pdf(opts);
        return { pages: countPdfPages(buf), fontsLoaded, pdf: opts.path ?? null };
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}

export function inRange(pages, tier) {
  const [lo, hi] = PAGE_RANGE[tier] ?? [0, Infinity];
  return pages >= lo && pages <= hi;
}
