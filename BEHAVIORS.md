# App Behaviors

A reference for how the Fellowship Case Logbook (TOTS Fellow Logbook) behaves at
runtime — access control, login, responsive display, and data handling. See
[SETUP.md](./SETUP.md) for backend configuration and [README.md](./README.md)
for an overview.

## 1. Access & device gate

The app is intended to run **only inside the LINE in-app browser, on a phone or
tablet**. Before any UI renders, `AuthGate` runs a hard gate:

| Where it's opened | Result |
| --- | --- |
| iPhone via LINE app | ✅ App loads |
| Android phone via LINE app | ✅ App loads |
| iPad via LINE app | ✅ App loads (see iPad note below) |
| Android tablet via LINE app | ✅ App loads |
| Desktop LINE client (Windows/Mac) | ⛔ "Mobile & Tablet Only" screen |
| Any external browser (Safari/Chrome, mobile or desktop) | ⛔ "Open This in the LINE App" screen |

- **Gate logic:** `liff.isInClient()` must be true (rejects external browsers),
  then `isLikelyDesktop()` must be false (rejects desktop LINE clients).
- **iPad note:** since iPadOS 13, Safari and embedded WebViews report a *Mac*
  user agent, so LIFF's `getOS()` returns `"web"` for a real iPad. The gate
  compensates by only treating `"web"` as desktop when the device has **no
  touchscreen** (`navigator.maxTouchPoints <= 1`). A real Mac has none; an iPad
  reports several, so it is correctly allowed through.
- The gate is **UX enforcement, not a security control** — the security
  boundary is the LINE-token verification + whitelist + OTP below.

## 2. Login flow

Authentication combines LINE identity (via LIFF) with an email whitelist. Full
walkthrough is in [SETUP.md](./SETUP.md#how-the-login-flow-works).

- **Returning, already-verified fellow:** recognized automatically from their
  LINE identity and dropped straight into the app — no email or code needed.
  - A cached browser session is used if present (fast path).
  - If the session was cleared (e.g. LINE cache wipe), the `check-line-user`
    Edge Function re-establishes one from the LINE identity — still no email.
- **First-time fellow:**
  1. Enters their email.
  2. Email is checked against the whitelist. **Not on the list → hard "Email
     Not Found" stop** (no code is sent).
  3. On the list → a 6-digit code is emailed.
  4. Code entered in a 6-box input (auto-advance, paste-to-fill, auto-submits on
     the 6th digit).
  5. On success, their LINE identity is permanently linked to their physician
     record; future opens use the returning-user path above.
- **Failure states:** a generic error screen with a **Try again** button
  re-runs the whole bootstrap.

## 3. Header

Once authenticated, the sticky header shows, pulled live from the fellow's own
whitelist row (readable only by them via row-level security):

- **Title** — the fellow's full name (Thai).
- **Institution** — `Institution : {name}`.
- **Subtitle** — `Operative case record : year 2026 - 2027` (fixed label).
- **Tabs** — New Entry / Case Log (with a live count).

Before the profile finishes loading the title area is briefly blank rather than
showing a placeholder name.

## 4. New Entry form

Eleven sections, all required unless noted:

1. **Date of Operation** + timing (Official hours / After hours).
2. **Diagnosis** (free text).
3. **AO classification** (optional to submit unless configured otherwise) — pick
   a region on the body map or via dropdown, then narrow by bone / segment /
   subtype / fracture type / group. A live AO/OTA code is computed and shown.
4. **Other classification** (free text).
5. **Approach & Position** (two fields).
6. **Procedure** (free text).
7. **Type of Procedure** (Primary / Revision / Staged).
8. **Your Role** (Primary surgeon / Primary assist / Secondary assist / Observer
   / Uncertain) — shown in a 2-column grid.
9. **Operative Time** (skin to skin, ranges).
10. **Place** (Home / Outside institution).
11. **Images** *(optional)* — pre/post-op films, intra-op findings. Multiple
    JPG / PNG / HEIC files, **10 MB total** cap. On selection, entirely
    **in the browser** (nothing leaves the device): HEIC is converted to JPEG
    (converter lazy-loads only when a HEIC is picked), then every image is
    **downscaled to a 2048px long edge and re-encoded to JPEG (q0.92)** to save
    storage — which also strips EXIF metadata (camera GPS/timestamp) and fixes
    orientation. Each processed image then goes through the **redaction review**
    (below) before being accepted. Files show thumbnails, are removable, and a
    running total is shown that turns red over 10 MB.

### Redaction review (removing burned-in patient info)

Before any image is accepted for upload, a full-screen review step opens — all
on-device, so the **un-redacted image never leaves the phone**:

The editor is **deterministic** — what you see masked is exactly what gets
burned in. There is no OCR/auto-detection: on X-rays it both missed real text
and threw false boxes over anatomy, and PHI removal needs a guarantee, not a
guess. Two tools:

- **Crop margins** (default): a "keep" frame with draggable corners. Burned-in
  identifiers (patient name, HN/ID, dates, hospital & system text) sit in the
  black borders around the anatomy, so the fellow fits the frame to the image
  and **everything outside it is blacked out** — all four margins in one
  gesture. A live dark mask previews exactly what will be removed. "Whole image"
  resets the frame for pictures with no margins.
- **Cover text**: drag across anything left inside the frame to add a solid
  black box (move/resize/remove supported) — for the rare label over anatomy.
- On "Apply & add", the outside-frame region and every box are burned in as
  **solid black** (a guaranteed removal that can't leave a ghost, unlike
  inpainting) and the flattened JPEG is what gets stored. The original is
  discarded. Runs fully on-device with no network dependency.
- "Cancel" discards the whole batch (nothing is added or uploaded).

- **Validation:** on Save, missing required fields surface in a banner listing
  each one; nothing is saved until all are filled. If the image total exceeds
  10 MB, save is blocked with a toast.
- **Save:** a case id is generated client-side, any images upload to the app's
  private **Google Drive** (via the `drive-images` Edge Function, which holds
  the Google refresh token server-side) first, then the case row (with the
  returned Drive file IDs) is inserted (scoped to the fellow via RLS). If an
  image upload fails the case is not created, so there are no image-less
  orphans. Shows a "Case saved to logbook" toast, resets the form, increments
  the tab count. The Save button shows a saving state and is disabled during the
  request.
- **Reset:** clears the form, AO selection, and selected images.

## 5. Case Log

- Lists the fellow's own saved cases, newest first, with a count.
- Each card shows date, timing, AO code, diagnosis, role · op-time · place.
- **Tap a card** to expand full details (other classification, approach,
  position, procedure type, procedure). On phones < 380px the detail grid
  collapses to a single column.
- If the case has images, the expanded view fetches them back through the
  `drive-images` function (which downloads them from the app's private Drive)
  and shows tappable thumbnails that open full size. Images are never shared
  with a public link.
- **Delete** removes a case optimistically; if the server rejects it, the case
  reappears and a toast reports the failure. On success, the case's images are
  also removed from Drive (best-effort).
- Empty state: a prompt to add the first case.

## 6. Data & persistence

- All cases live in Supabase (Postgres); **each fellow sees only their own** via
  row-level security.
- Enumerated fields (timing, role, procedure type, op time, place) are
  constrained both in TypeScript and by database CHECK constraints — invalid
  values are rejected at write time.
- Cases load once on entry; there is no live cross-device refresh (a personal
  logbook, so this is by design).
- Case images live in the app's **private Google Drive** (one program-owned
  Drive), uploaded and read back through the JWT-protected `drive-images` Edge
  Function — the browser never talks to Google directly (its OAuth is blocked
  inside LINE's webview). The `cases.image_paths` column stores the Drive file
  IDs. Images are never served via a public link.
- A failed initial load shows a toast asking the user to check their connection
  and reload.

## 7. Display & rendering

- **Responsive:** a single content column capped at 960px and centered. On
  phones it fills the width; on tablets it centers with neutral side margins.
  Two-column field groups collapse to one column on narrow screens. Verified at
  real iPhone, iPad portrait, and iPad landscape sizes.
- **Fonts:** self-hosted (no external CDN). Latin uses IBM Plex Sans; Thai
  (name / institution) uses IBM Plex Sans Thai, so both scripts share the same
  type family. Falls back to the system sans-serif if the fonts fail to load.
- **Glass styling:** header and cards use `backdrop-filter` blur where
  supported; on engines without it they degrade to a flat translucent panel.
- **Micro-interactions:** option pills, AO map markers, and tabs scale/pop on
  press and selection (respecting the browser's reduced-motion where the engine
  applies it).
- **Mobile viewport:** full-height screens use `100dvh` so they center correctly
  under mobile browser toolbars; the save toast clears the iPhone home indicator
  via `safe-area-inset`.
- **Native controls:** the date picker and region dropdown render in each
  platform's native style (iOS wheel, Android dialog, etc.).

## 8. Known edge cases

- A **touchscreen Windows laptop running the desktop LINE client** would pass
  the gate (touch + in-client). Rare; low impact.
- If `fonts` fail to load on a restricted network, text still renders in the
  system font — layout is unaffected.
