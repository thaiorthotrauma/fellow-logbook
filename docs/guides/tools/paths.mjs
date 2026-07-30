// Every tool resolves its paths from here, so they can be run from any cwd.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const GUIDES = resolve(here, '..');
export const REPO = resolve(GUIDES, '../..');
export const FIGS = resolve(GUIDES, 'figs');
export const FONTS = resolve(GUIDES, 'fonts');
export const EXPORTS = resolve(GUIDES, 'exports');
export const OUT = resolve(REPO, 'docs');

/** The harness dev server (vite.guide.config.ts pins this port). */
export const HARNESS = 'http://localhost:5199';

export const CHROMIUM =
  process.env.GUIDE_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** iPhone 17: 402 x 874 pt at 3x. Every app figure in the guides is captured
 *  at exactly this size, which is what the guides state on their covers. */
export const IPHONE_17 = {
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 ' +
    '(KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1 Line/15.6.0',
};

export const DOCS = [
  { src: resolve(GUIDES, 'fellow.html'), out: resolve(OUT, 'TOTS-Fellow-Logbook-Fellow-Guide.pdf'), title: 'Fellow Logbook — Fellow User Guide' },
  { src: resolve(GUIDES, 'staff.html'), out: resolve(OUT, 'TOTS-Fellow-Logbook-Staff-Guide.pdf'), title: 'Fellow Logbook — Staff User Guide' },
];
