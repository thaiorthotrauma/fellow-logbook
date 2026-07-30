// Drives the app's own PDF export in the harness and saves the resulting files,
// so the guides can show what the exported document really looks like rather
// than describing it.
//
// The harness's LIFF stub has no openWindow, so deliverPdf() falls through to
// its anchor-download branch — which is what Playwright catches here.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHROMIUM, EXPORTS, HARNESS, PHONE_VIEWPORT } from './paths.mjs';

mkdirSync(EXPORTS, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ ...PHONE_VIEWPORT, deviceScaleFactor: 2, acceptDownloads: true });
const page = await ctx.newPage();

async function grab(query, out) {
  await page.goto(`${HARNESS}/?${query}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('.header-title');
  await page.locator('.tab:text-is("PDF")').click();
  await page.waitForSelector('.export-actions');
  await page.waitForTimeout(600);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.locator('.btn-primary').click(),
  ]);
  await download.saveAs(out);
  console.log('  ✓', out);
}

await grab('mock=fellow', `${EXPORTS}/fellow-export.pdf`);
await grab('mock=staff&view=staff', `${EXPORTS}/staff-export.pdf`);

await browser.close();
