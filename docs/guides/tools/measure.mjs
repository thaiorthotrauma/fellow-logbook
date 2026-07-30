// Checks each <section class="page"> against the A4 content box.
//
// The guides are laid out one section per page, so a section taller than the
// content box silently spills a line or two onto a near-empty page — which is
// only obvious once the PDF is rendered and flipped through. This reports it as
// a number instead, and exits non-zero so a build can refuse to ship it.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { CHROMIUM, DOCS } from './paths.mjs';

const MM = 3.779527559;
const W = 182 * MM; // 210 - 14 - 14 margins
const H = 266 * MM; // 297 - 15 - 16 margins

const browser = await chromium.launch({ executablePath: CHROMIUM });
let overflowing = 0;

for (const { src } of DOCS) {
  const page = await browser.newPage({ viewport: { width: Math.round(W), height: Math.round(H) } });
  await page.emulateMedia({ media: 'print' });
  await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('section.page')].map((s, i) => ({
      n: i + 1,
      title: (s.querySelector('h2, .cover-title')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 44),
      h: s.getBoundingClientRect().height,
    })),
  );

  console.log(`\n${src}`);
  for (const r of rows) {
    const pct = (r.h / H) * 100;
    if (pct > 100) overflowing++;
    const flag = pct > 100 ? '  ** OVERFLOWS **' : pct < 55 ? '  (sparse)' : '';
    console.log(`  p${String(r.n).padStart(2)}  ${pct.toFixed(0).padStart(3)}%  ${r.title}${flag}`);
  }
  await page.close();
}

await browser.close();
console.log(overflowing === 0 ? '\nAll sections fit their page.' : `\n${overflowing} section(s) overflow.`);
process.exit(overflowing === 0 ? 0 : 1);
