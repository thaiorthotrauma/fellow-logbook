# Usage guides — how they are built

Two printable A4 guides live in [`docs/`](..):

| Guide | Audience | Pages |
| --- | --- | --- |
| [`TOTS-Fellow-Logbook-Fellow-Guide.pdf`](../TOTS-Fellow-Logbook-Fellow-Guide.pdf) | Fellows on the roster | 15 |
| [`TOTS-Fellow-Logbook-Staff-Guide.pdf`](../TOTS-Fellow-Logbook-Staff-Guide.pdf) | Supervising staff | 13 |

Every app screen in them is a **real screenshot of this app**, captured from the
running UI at a **mobile phone viewport (402 × 874 pt at 3×)** — not a mockup. The
two figures showing the exported logbook are the app's *own* PDF export, driven
through the real `ExportPdfPanel` and rasterised. So the figures cannot drift
from the app by being redrawn; they drift only if the UI changes and nobody
reruns the build.

## Rebuilding

```sh
node docs/guides/tools/build.mjs
```

That starts the harness, captures every figure, runs the in-app export, prepares
the assets, checks the page fit, and writes both PDFs into `docs/`.

One-off prerequisites (none are runtime dependencies of the app, so they are
deliberately not in `package.json`):

```sh
npm install                      # the app's own deps, for the harness and the fonts
npm i -D playwright && npx playwright install chromium
pip install pypdfium2 pillow     # rasterising the app's export, and figure optimisation
```

If Chromium is already on the machine, point at it with `GUIDE_CHROMIUM=/path/to/chrome`
rather than installing a second copy.

## How the screenshots are possible

The app refuses to run outside LINE's in-app browser, and it needs Supabase, a
LIFF app, and Google Drive behind it. Rather than mock the UI, the harness
([`.guide-harness/`](../../.guide-harness), served by
[`vite.guide.config.ts`](../../vite.guide.config.ts)) swaps two modules for local
stubs and renders the **real** components:

- `@line/liff` → a stub that answers as a logged-in LINE session on a phone.
  The harness renders `App` directly rather than through `AuthGate` (see
  `.guide-harness/main.tsx`), so the real device gate never actually runs —
  the stub just needs to satisfy the app's own calls into `liff`.
- `@supabase/supabase-js` → an in-memory stand-in holding a fictional roster and
  case list, so the app is fully interactive — log, edit, delete, export — with
  no backend.

`?mock=fellow` / `?mock=staff` choose which identity the stub answers as, and
`?screen=email|otp|rejected|gate-browser|gate-desktop` renders an auth screen
directly (`AuthGate` only reaches those by way of a real LINE identity).

The sample data in [`sampleData.ts`](../../.guide-harness/stubs/sampleData.ts) is
**fictional** — invented names, made-up HNs, generic teaching-example clinical
text. Case images are labelled placeholder tiles, not radiographs.

## Editing the guides

The content is [`fellow.html`](./fellow.html) and [`staff.html`](./staff.html),
sharing [`guide.css`](./guide.css). To re-render after a text edit, without
recapturing anything:

```sh
node docs/guides/tools/measure.mjs && node docs/guides/tools/render.mjs
```

**Both guides are laid out one `<section class="page">` per printed page.** That
is a constraint, not a coincidence: a section that grows past the A4 content box
spills a line or two onto an otherwise blank page. `measure.mjs` reports each
section as a percentage of the page and exits non-zero if any overflows, so run
it after editing — and if a section goes over, either trim it or split it into
two sections with their own headings, rather than letting it wrap.

Figure widths are the main lever on a page's height. A pair of phone screens at
full column width is about three quarters of a page, which is why
`.shots.phones` caps them; `.split .shot-col` (and its `tight` / `narrow` /
`wide` variants) sizes a screen sitting beside body text.

`figs/`, `fonts/`, and `exports/` are all generated and are not committed.
