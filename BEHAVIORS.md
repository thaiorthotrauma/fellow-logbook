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

Fourteen sections, all required unless noted:

1. **Date of Operation** + timing (Official hours / After hours).
2. **Place** (Home / Outside institution).
3. **Staff** (single-line free text) — required.
4. **HN** (single-line) — required; input is restricted as typed to digits
   0–9 (anything else is stripped), with a numeric keypad on mobile.
5. **Diagnosis** (free text).
6. **AO classification** — pick a region on the body map or via dropdown, then
   narrow by bone / segment / subtype / fracture type / group. A live AO/OTA
   code is computed and shown.
7. **Other classification** (free text).

   Q6 and Q7 are an **"answer at least one" pair** (both cards show an
   "Answer #6 or #7" tag): a case saves as long as *either* an AO
   classification (a computed code) *or* an Other classification is provided.
   Only if **both** are empty does validation block save, listing
   "AO classification or Other classification".
8. **Approach** (free text).
9. **Procedure(s)** (free text).
10. **Type of Procedure** (Primary / Revision / Staged).
11. **Your Role** (Primary surgeon / Primary assist / Secondary assist / Observer
    / Uncertain) — shown in a 2-column grid.
12. **Operative Time** (skin to skin, ranges).
13. **Image(s)** *(optional)* — pre/post-op films, intra-op findings. Multiple
    JPG / PNG / HEIC files, **10 MB total** cap. On selection, entirely
    **in the browser** (nothing leaves the device): HEIC is converted to JPEG
    (converter lazy-loads only when a HEIC is picked), then every image is
    **downscaled to a 2048px long edge and re-encoded to JPEG (q0.92)** to save
    storage — which also strips EXIF metadata (camera GPS/timestamp) and fixes
    orientation — and accepted immediately. Files show thumbnails, are
    removable, and a running total is shown that turns red over 10 MB. There is
    no redaction/annotation-removal step — images are uploaded as captured.
14. **Memo** *(optional)* — free-text notes, 3-row textarea.

Staff, HN, and Memo are stored on the `cases` row (`staff` / `hn` / `memo`
columns). Note HN is a patient identifier — it lives in the fellow's own
RLS-scoped rows and is not included in the exported PDF.

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
- **Tap a card** to expand full details (staff, HN, classification, approach,
  position, type of procedure, procedure(s), memo) — always a single column,
  on both phone and tablet.
  - The **Classification** row combines Q6 (AO classification) and Q7 (Other
    classification): if only Q6 was answered it shows "AO/OTA &lt;code&gt;"
    with no bullet; if only Q7 was answered it shows that text with bullet
    markers stripped; if both were answered it shows a bulleted list — the
    AO/OTA line first, then each of Q7's lines.
- If the case has images, the expanded view fetches them back through the
  `drive-images` function (which downloads them from the app's private Drive)
  and shows tappable thumbnails that open full size. Images are never shared
  with a public link.
- **Edit** reopens the case in the entry form, prefilled, with the first tab
  relabelled "Edit Case", a banner above the form, and Cancel / Save Changes
  instead of Reset / Save Case. Saving returns to the log with that card
  expanded.
  - The AO picker's selection is rebuilt from the stored code (a row keeps only
    the flat code plus the region name), so the diagram and pills come back
    preselected. Round-tripping is covered for every selection the picker can
    produce, which pins the property that matters: re-saving an untouched case
    cannot change its AO code.
  - Saved images can be removed and new ones added. On save the added files
    upload first, then the row updates, and only then are dropped Drive files
    deleted — so a failed save never leaves a case pointing at deleted images.
    A failed update rolls back that edit's uploads instead of orphaning them.
  - The 10 MB limit applies to newly added images only; already-saved ones don't
    count against it.
  - Deleting a case that's open for editing abandons the edit.
- **Delete** removes a case optimistically; if the server rejects it, the case
  reappears and a toast reports the failure. On success, the case's images are
  also removed from Drive (best-effort).
- Empty state: a prompt to add the first case.

## 5a. PDF export

A third header tab, **PDF**, is a full-screen panel to export the logbook for a
**month range** (two `month` pickers, defaulting to the full span of existing
cases). The whole document is built **on-device** with
`@react-pdf/renderer` (lazy-loaded, ~1 MB, only when exporting) from cases
already in memory — no server round-trip. It ignores the Case Log's
search/institution filters; the export is always the complete record for the
chosen range. IBM Plex Sans Thai TTFs are bundled and registered so the Thai
fellow name/institution render.

- **Page 1 — summary:** fellow name/institution/year, case count, **Top 5
  Diagnoses (Q2)** and **Top 5 Procedures (Q6)** ranked by normalized text
  frequency, and pie charts of **Type (Q7)**, **Role (Q8)** and **Place (Q10)**.
- **Content pages:** one block per case, **oldest → newest**, each with date +
  timing/place/AO-code chips and the Q2–Q9 fields. Images are not embedded.
- **Delivery (on-device):** the finished PDF goes to the native share sheet
  (`navigator.share` with files) — Save to Files, email, or the user can send it
  into a LINE chat themselves. Falls back to opening in the external browser,
  then a plain download. A LINE *bot* can't attach a file to chat, so there's no
  auto-push into the OA chatbox.

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

## 6a. Telegram notifications (admin)

Three situations post a message to a single admin Telegram chat. The bot token
is a server-side secret, so the browser never talks to Telegram itself.

- **New case logged** and **case edited** go through the JWT-protected
  `notify-case` Edge Function, called after the save has committed. The function
  re-reads the case from the database rather than trusting the request body, so
  a notification always reflects a real stored row owned by the caller and the
  request can't push arbitrary text into the admin chat. The fellow's name and
  institution likewise come from the `physicians` table, not the client.
  - An edit reports **only the fields that changed**, as struck-through old →
    new (Telegram has no coloured text). Short values sit inline; long or
    multi-line ones stack. Images report as a count, not Drive file IDs. A save
    that changed nothing sends no message.
  - The prior values behind that diff are the one thing supplied by the client —
    only it knows the pre-update state. These are advisory notifications, not an
    audit log.
- **Inbound LINE chat** goes through `line-webhook`, called by LINE rather than
  the browser. It has no Supabase session, so authenticity comes from the
  `X-Line-Signature` HMAC instead and it must be deployed with
  `--no-verify-jwt`. It reports the sender's LINE user ID in full as tappable
  `code`, plus the message quoted. Senders with no `physicians` row are labelled
  as unregistered — the common case, since anyone who finds the official account
  can message it, and that's exactly who the raw ID is needed for.
- **PHI:** Telegram is outside the app's Supabase + private-Drive perimeter, bot
  messages aren't end-to-end encrypted, and they persist in chat history and
  lock-screen previews. **HN is therefore masked to its last four digits** in
  both case notifications. Clinical text (diagnosis, procedure) is sent in full.
- Notifications are **advisory and best-effort**: they are never awaited, a
  Telegram outage can never turn into a failed save, and with the Telegram
  secrets unset every send silently no-ops so the app works without them.

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
