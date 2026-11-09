// BL2-06 (FDY-282): fill the chair's prompt with the panelists' reviews (import/subagent workflow).
//
//   node scripts/review/fill-chair.mjs <prompts-dir> <import-dir>
//
// For every `<prefix>.G2.chair.<slug>.prompt.json` emitted by `run.mjs --panel emit`, when every
// panelist output it `needs` exists in <import-dir>, writes `<prefix>.G2.chair.<slug>.filled.prompt.json`
// with {{PANEL_REVIEWS}} replaced by the panelists' JSON — the exact prompt the chair session receives.
// The API path (`--panel api`) does the same substitution in memory (runPanelApi).

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [promptsDir, importDir] = process.argv.slice(2);
if (!promptsDir || !importDir) {
  console.error('usage: node scripts/review/fill-chair.mjs <prompts-dir> <import-dir>');
  process.exit(2);
}
let filled = 0;
for (const f of readdirSync(promptsDir).filter((x) => /\.G2\.chair\.[a-z-]+\.prompt\.json$/.test(x))) {
  const p = JSON.parse(readFileSync(join(promptsDir, f), 'utf8'));
  const prefix = f.split('.')[0];
  const blocks = [];
  let missing = [];
  for (const slug of p.needs ?? []) {
    const path = join(importDir, `${prefix}.G2.${slug}.json`);
    if (!existsSync(path)) { missing.push(slug); continue; }
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    blocks.push(`### ${slug}\n${JSON.stringify(raw?.review ?? raw)}`);
  }
  if (missing.length) { console.log(`[fill-chair] ${f}: waiting for ${missing.join(', ')}`); continue; }
  const out = { ...p, user: p.user.replace('{{PANEL_REVIEWS}}', blocks.join('\n\n')), filled_from: p.needs };
  const name = f.replace(/\.prompt\.json$/, '.filled.prompt.json');
  writeFileSync(join(promptsDir, name), JSON.stringify(out, null, 1));
  console.log(`[fill-chair] wrote ${name} (${blocks.length} panelist reviews)`);
  filled += 1;
}
console.log(`[fill-chair] ${filled} chair prompt(s) filled`);
