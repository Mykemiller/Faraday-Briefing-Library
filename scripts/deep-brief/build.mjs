import fs from 'node:fs';
const [,, src, out] = process.argv;
let md = fs.readFileSync(src, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const inline = s => esc(s)
  .replace(/\[(S\d+)\](?!\()/g, '<a class="ref" href="#src-$1">$1</a>')
  .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');
const lines = md.split('\n');
let html = [], i = 0, sectionOpen = false, json = '';
const closeSection = () => { if (sectionOpen) { html.push('</section>'); sectionOpen = false; } };
const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
while (i < lines.length) {
  let l = lines[i];
  if (!l.trim()) { i++; continue; }
  if (l.startsWith('```json')) { i++; const b=[]; while(!lines[i].startsWith('```')) b.push(lines[i++]); i++; json=b.join('\n');
    html.push(`<details class="refs-json"><summary>source_refs (BL-03 jsonb, ${JSON.parse(json).length} entries)</summary><pre>${esc(JSON.stringify(JSON.parse(json),null,2))}</pre></details>`); continue; }
  if (l.startsWith(':::')) {
    const kind = l.slice(3).trim();
    if (kind) { closeSection(); html.push(kind==='cover' ? '<header class="cover">' : `<section class="part take-page" id="take"><aside class="take">`); html.push(`<!--${kind}-->`); }
    else { const last = html.findLast(x=>/^<!--(cover|take)-->$/.test(x)); html.push(last==='<!--cover-->' ? '</header>' : '</aside></section>'); }
    i++; continue;
  }
  if (l.startsWith('# ')) { html.push(`<p class="eyebrow">Faraday Intelligence · Briefing Library · Deep brief</p><h1>${inline(l.slice(2))}</h1>`); i++; continue; }
  if (l.startsWith('## ')) {
    const t = l.slice(3); const inTake = html.at(-1)==='<!--take-->' || html.includes('<!--take-->') && !html.slice(html.lastIndexOf('<!--take-->')).includes('</aside></section>');
    if (inTake) { html.push(`<h2>${inline(t)}</h2>`); i++; continue; }
    closeSection(); const m = t.match(/^(\d+)\.\s+(.*)$/);
    html.push(`<section class="part" id="${slug(m?m[2]:t)}">`); sectionOpen = true;
    html.push(`<div class="rule" aria-hidden="true"></div>`);
    html.push(m ? `<h2><span class="num">${m[1]}</span>${inline(m[2])}</h2>` : `<h2>${inline(t)}</h2>`);
    i++; continue;
  }
  if (l.startsWith('|')) { const rows=[]; while(i<lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
    const cells = r => r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
    const head = cells(rows[0]); const body = rows.slice(2).map(cells);
    html.push(`<div class="tbl"><table><thead><tr>${head.map(h=>`<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r=>`<tr${/^S\d+$/.test(r[0])?` id="src-${r[0]}"`:''}>${r.map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue; }
  if (/^(- |\d+\. )/.test(l)) { const ordered = /^\d+\. /.test(l); const items=[];
    while(i<lines.length && /^(- |\d+\. )/.test(lines[i])) items.push(lines[i++].replace(/^(- |\d+\. )/,''));
    const tag = ordered?'ol':'ul'; const cls = html.at(-1)==='<!--cover-->' || html.at(-2)==='<!--cover-->' || html.findLast(x=>/^<!--|<\/header>/.test(x))==='<!--cover-->' ? ' class="meta"' : '';
    html.push(`<${tag}${cls}>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</${tag}>`); continue; }
  const para=[]; while(i<lines.length && lines[i].trim() && !/^(#|\||- |\d+\. |:::|```)/.test(lines[i])) para.push(lines[i++]);
  const p = para.join(' ');
  if (/^\*Claim: .*\*$/.test(p)) html.push(`<p class="deck">${inline(p.slice(8,-1))}</p>`);
  else if (/^\*— .*\*$/.test(p)) html.push(`<p class="sig">${inline(p.slice(1,-1))}</p>`);
  else if (html.at(-1)?.startsWith('<h1>') || html.at(-1)?.includes('</h1>')) html.push(`<p class="standfirst">${inline(p)}</p>`);
  else html.push(`<p>${inline(p)}</p>`);
}
closeSection();
const tpl = fs.readFileSync(new URL('./shell.html', import.meta.url), 'utf8');
fs.writeFileSync(out, tpl.replace('<!--BODY-->', html.join('\n')).replace('<!--JSON-->', `<script type="application/json" id="source-refs">${json}</script>`));
