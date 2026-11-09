// BL2-06 (FDY-282): render a draft manuscript and count its Letter pages for G1-AUTO.
//
// Uses the BL2-05 manuscript renderer of record (scripts/templates/manuscript.mjs: the Deep shell for
// Deep, the BL-09 stylesheet for Standard/Profile) and its Playwright page counter, so the review chain
// measures exactly what the generator measured. The PDF it writes is the preview the sign-off queue
// links to. PDFs are never committed. Fonts: Google Fonts when reachable; `fonts_loaded` is recorded so a
// reviewer can tell when the fallback stack printed (counts can rise by a page).

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { renderManuscript, createPageCounter, countPdfPages } from '../templates/manuscript.mjs';

export { renderManuscript, countPdfPages };

let counter = null;
async function pageCounter(pdfDir) {
  if (!counter || counter.pdfDir !== pdfDir) {
    if (counter) await counter.close();
    const c = await createPageCounter({ pdfDir });
    counter = { pdfDir, count: c.count, close: c.close };
  }
  return counter;
}

/** Close the shared browser (call once at the end of a run). */
export async function closeRenderer() {
  if (counter) await counter.close();
  counter = null;
}

/**
 * Render + print + count. Returns { pages, pdf_path, html_path, fonts_loaded, error }.
 * Never throws for render failures: G1 records `pages: null` with the note instead.
 */
export async function measurePages({ manuscript, tier, outDir, basename }) {
  const dir = outDir ?? join(tmpdir(), 'bl2-06-review');
  mkdirSync(dir, { recursive: true });
  const name = basename ?? 'draft';
  const htmlPath = join(dir, `${name}.html`);
  const pdfPath = join(dir, `${name}.pdf`);
  try {
    const html = renderManuscript(manuscript ?? '', tier === 'deep' ? 'deep' : tier === 'profile' ? 'profile' : 'standard');
    writeFileSync(htmlPath, html);
    const c = await pageCounter(dir);
    const r = await c.count(html, { name });
    return { pages: r.pages, pdf_path: r.pdf ?? (existsSync(pdfPath) ? pdfPath : null), html_path: htmlPath, fonts_loaded: r.fontsLoaded, error: null };
  } catch (e) {
    return { pages: null, pdf_path: existsSync(pdfPath) ? pdfPath : null, html_path: existsSync(htmlPath) ? htmlPath : null, fonts_loaded: 0, error: String(e?.message ?? e) };
  }
}
