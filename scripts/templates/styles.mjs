// BL-09 Standard/Profile print stylesheet (Brand Bible V2 tokens). Shared by render.mjs (sample data
// files) and manuscript.mjs (BL2-05 generated manuscripts) so both print from one rule set.

export const STYLE = `
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
