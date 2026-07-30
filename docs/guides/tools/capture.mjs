// Captures every app figure the guides use, from the running harness
// (vite.guide.config.ts), at an iPhone 17 viewport.
//
// App screens are captured as full viewport frames — what a fellow or staff
// member actually sees, sticky header included. The auth cards are captured as
// tight crops instead, since a full frame of one is mostly empty background.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { CHROMIUM, FIGS, HARNESS, IPHONE_17 } from './paths.mjs';

mkdirSync(FIGS, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext(IPHONE_17);
const page = await ctx.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));

const settle = (ms = 500) => page.waitForTimeout(ms);

async function open(query) {
  await page.goto(`${HARNESS}/?${query}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await settle(600);
}

/** Scrolls so `selector`'s top sits just under the sticky header, then shoots
 *  the viewport — the same framing the app itself uses when expanding a card. */
async function align(selector, pad = 10) {
  await page
    .locator(selector)
    .first()
    .evaluate((el, p) => {
      const headerH = document.querySelector('.header')?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - headerH - p), behavior: 'instant' });
    }, pad);
  await settle(250);
}

async function shot(name) {
  await page.screenshot({ path: `${FIGS}/${name}.png` });
  console.log('  ✓', name);
}

/** A card in the entry form, by its step number. */
const card = n => `.card:has(> .card-header > .step-badge:text-is("${n}"))`;

// ------------------------------------------------------------- auth screens
console.log('auth screens');
for (const [screen, name, typing] of [
  ['email', 'a-email', null],
  ['otp', 'a-otp', '412'],
  ['rejected', 'a-rejected', null],
  ['gate-browser', 'a-gate-browser', null],
  ['gate-desktop', 'a-gate-desktop', null],
]) {
  await open(`screen=${screen}`);
  if (typing) {
    await page.locator('input').first().click();
    await page.keyboard.type(typing);
    await settle(300);
  }
  const box = await page.locator('.auth-card').boundingBox();
  const pad = 18;
  const x = Math.max(0, box.x - pad);
  await page.screenshot({
    path: `${FIGS}/${name}.png`,
    clip: { x, y: Math.max(0, box.y - pad), width: Math.min(IPHONE_17.viewport.width - x, box.width + pad * 2), height: box.height + pad * 2 },
  });
  console.log('  ✓', name);
}

// ------------------------------------------------------------- fellow: form
console.log('fellow — new entry');
await open('mock=fellow');
await page.waitForSelector('.header-title');
await shot('f-form-top');

await align(card(3));
await shot('f-form-staff-hn');

await align(card(6));
await shot('f-ao-empty');

// Femur → diaphyseal → type A → group 2, i.e. the code 32-A2 the guide walks
// through.
await page.locator('.ao-dot[title="Femur"]').click();
await settle(300);
await page.locator(`${card(6)} .pill:text-is("Diaphyseal (32)")`).click();
await page.locator(`${card(6)} .pill:text-is("Type A")`).click();
await page.locator(`${card(6)} .pill:text-is("Group 2")`).click();
await settle(350);
await align(card(6));
await shot('f-ao-picked');
await align(`${card(6)} .ao-detail-panel`, 4);
await shot('f-ao-detail');

// Fill the rest so the later figures show a complete, realistic entry.
await page.locator('input[type="date"]').fill('2026-07-28');
await page.locator(`${card(1)} .pill:text-is("Official hours")`).click();
await page.locator(`${card(2)} .pill:text-is("Home institution")`).click();
await page.locator(`${card(3)} input`).fill('อ. สมชาย');
await page.locator(`${card(4)} input`).fill('6706124');
await page.locator(`${card(5)} textarea`).fill('Closed fracture left femoral shaft');
await page.locator(`${card(8)} textarea`).fill('Lateral, minimally invasive');
await page.locator(`${card(9)} textarea`).fill('Closed reduction and antegrade intramedullary nailing');
await page.locator(`${card(10)} .pill:text-is("Primary surgery")`).click();
await page.locator(`${card(11)} .pill:text-is("Primary surgeon")`).click();
await page.locator(`${card(12)} .pill:text-is("2–3 hr")`).click();
await settle(300);

await align(card(7));
await shot('f-form-q7-q10');
await align(card(11));
await shot('f-form-role-time');
await align(card(13));
await shot('f-form-images-memo');

await page.locator('.btn-primary:text-is("Save Case")').click();
await page.waitForSelector('.toast');
await settle(300);
await shot('f-saved-toast');

// ---------------------------------------------------------- fellow: validation
console.log('fellow — validation');
await open('mock=fellow');
await page.waitForSelector('.header-title');
await page.locator('.btn-primary:text-is("Save Case")').click();
await page.waitForSelector('.error-banner');
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await settle(300);
await shot('f-validation');

// ------------------------------------------------------------ fellow: case log
console.log('fellow — case log');
await open('mock=fellow');
await page.waitForSelector('.header-title');
await page.locator('.tab', { hasText: 'Case Log' }).click();
await page.waitForSelector('.case-card');
await settle(400);
await shot('f-log-list');

await page.locator('.log-search').fill('femur');
await settle(500);
await shot('f-log-search');
await page.locator('.log-search').fill('');
await settle(400);

// The one sample case that carries images.
await page.locator('.case-card', { hasText: 'distal tibia' }).locator('.case-card-main').click();
await page.waitForSelector('.case-card-expanded');
await settle(1500); // let the image thumbnails resolve
await align('.case-card.expanded', 8);
await shot('f-log-expanded');
await align('.case-card.expanded .case-card-actions', 220);
await shot('f-log-expanded-actions');

await page.locator('.case-card-edit').click();
await page.waitForSelector('.edit-banner');
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await settle(400);
await shot('f-edit-banner');

// ------------------------------------------------------------ fellow: PDF panel
console.log('fellow — PDF');
await open('mock=fellow');
await page.waitForSelector('.header-title');
await page.locator('.tab:text-is("PDF")').click();
await page.waitForSelector('.export-actions');
await settle(500);
await shot('f-pdf-panel');

// ------------------------------------------------------------- staff: case list
console.log('staff — institution cases');
await open('mock=staff&view=staff');
await page.waitForSelector('.header-staff .header-title');
await page.waitForSelector('.case-card');
await settle(500);
await shot('s-log-list');

await align('.log-controls', 8);
await shot('s-log-controls');

await page.locator('.fellow-badge').first().click();
await settle(500);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await settle(250);
await shot('s-log-badge-filter');
await page.locator('.fellow-badge.active').click();
await settle(400);

// Head of an expanded case: the masked HN.
await page.locator('.case-card', { hasText: 'distal radius' }).locator('.case-card-main').click();
await page.waitForSelector('.case-card-expanded');
await settle(700);
await align('.case-card.expanded', 8);
await shot('s-log-expanded');
await page.locator('.case-card.expanded .case-card-main').click();
await settle(300);

// Foot of an expanded case: images, and no Edit/Delete — the read-only point.
await page.locator('.case-card', { hasText: 'distal tibia' }).locator('.case-card-main').click();
await page.waitForSelector('.case-card-expanded');
await settle(2000);
await page.locator('.case-card.expanded').evaluate(el => {
  window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().bottom - window.innerHeight + 24, behavior: 'instant' });
});
await settle(600);
await shot('s-log-expanded-foot');
await page.locator('.case-card.expanded .case-card-main').click();
await settle(300);

await page.locator('.log-search').fill('pelvic');
await settle(600);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
await settle(250);
await shot('s-log-search');

// ---------------------------------------------------------------- staff: PDF
console.log('staff — PDF');
await open('mock=staff&view=staff');
await page.waitForSelector('.header-staff .header-title');
await page.locator('.tab:text-is("PDF")').click();
await page.waitForSelector('.export-actions');
await settle(600);
await shot('s-pdf-month');

await page.locator('.seg-btn:text-is("By fellow")').click();
await settle(400);
await shot('s-pdf-fellow');

await page.locator('.seg-btn:text-is("Single fellow")').click();
await settle(400);
await page.locator('.export-field select').last().selectOption({ index: 1 });
await settle(500);
await shot('s-pdf-single');

// ---------------------------------------------------------------- demo preview
console.log('demo preview');
await open('mock=fellow&view=demo');
await page.waitForSelector('.demo-banner');
await settle(500);
await shot('s-demo');

await browser.close();
console.log('figures →', FIGS);
