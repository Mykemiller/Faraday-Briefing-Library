const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('fs');
(async () => {
  const [src, out] = process.argv.slice(2);
  const body = fs.readFileSync(src, 'utf8');
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body style="margin:0">${body}</body></html>`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  await page.setContent(doc, { waitUntil: 'networkidle', timeout: 30000 }).catch(e=>console.error('setContent:', e.message));
  const fonts = await page.evaluate(() => [...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family));
  console.log('fonts loaded:', [...new Set(fonts)].join(', ') || 'none (fallback stack)');
  await page.pdf({ path: out, format: 'Letter' });
  await browser.close();
  const pdf = fs.readFileSync(out, 'latin1');
  console.log('pages:', (pdf.match(/\/Type\s*\/Page[^s]/g) || []).length);
})();
