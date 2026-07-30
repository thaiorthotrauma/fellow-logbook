// Renders the guide HTML to A4 PDFs in docs/.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { CHROMIUM, DOCS } from './paths.mjs';

const footer = title => `
<div style="width:100%;font-family:sans-serif;font-size:7pt;color:#8b9895;padding:0 14mm;
            display:flex;justify-content:space-between;">
  <span>${title}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage();

for (const { src, out, title } of DOCS) {
  await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.pdf({
    path: out,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', right: '14mm', bottom: '16mm', left: '14mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: footer(title),
  });
  console.log('✓', out);
}

await browser.close();
