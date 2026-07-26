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
  5. On success, their LINE identity is permanently linked to their fellow
     record; future opens use the returning-user path above.
- **Failure states:** a generic error screen with a **Try again** button
  re-runs the whole bootstrap.

### Staff sign-in (no email/OTP)

A second identity path for institution staff, reached via `?view=staff` (the
staff rich menu's "Fellow Cases" button — see `line-oa/README.md`) or,
as a fallback, automatically whenever the normal fellow check above finds an
unrecognized LINE id. Staff are pre-seeded (`supabase/seed_staff.sql`) with no
email at all — trusted by LINE id alone, since there's no whitelist step to
verify against.

- Creates an **anonymous Supabase session** (`signInAnonymously()` — a real
  session tied to no email/credential) and, via the `link-line-staff` Edge
  Function, verifies the LINE id server-side and links this device to the
  matching `staff` row.
- **One row per device, not one per staff member** (`staff_devices`, not a
  single `user_id` column): an anonymous session has no identity to share
  across a phone and a tablet the way a fellow's email does, so phone and
  tablet each get an unrelated session and both stay linked simultaneously —
  neither kicks the other out.
- `?view=staff` is an **explicit override**, not just a hint: it skips the
  "trust an existing session" fast path and forces a fresh staff-link attempt,
  so someone who happens to also be a fellow (this app's own test account, for
  one) still reaches the staff view via their rich menu button instead of
  their existing fellow session winning by default.
- Not a recognized staff LINE id → degrades gracefully into the normal fellow
  flow (or the email screen, for a genuinely unrecognized account) rather than
  showing an error.

### Demo mode (no identity at all)

`?view=demo` (the staff rich menu's "Logbook Demo" button) skips login
entirely — only the device gate above applies. See §4a.

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

## 4a. Demo mode

Reached via `?view=demo` (see §2), shown to anyone the staff rich menu's
"Logbook Demo" button was tapped by. Same three tabs as the normal fellow
view, all inert:

- **New Entry** shows a banner ("Demo — inputs are disabled and nothing is
  saved") and the form is wrapped so nothing in it can be typed, selected, or
  submitted (`pointer-events: none`, not a `disabled` prop threaded through
  every field individually).
- **Case Log** always shows the empty state — cases are never fetched at all
  in demo mode, not fetched-then-hidden, so no network request touches real
  data.
- **PDF** shows its normal "no cases to export yet" state, since there's
  nothing to export — the month pickers never render in that state, so
  there's no dedicated "disable the picker" code path; it falls out of the
  already-empty case list.
- No LINE verification, no Supabase session, no account involved — the
  device gate (in-app, mobile) still applies, identity does not.

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

## 5b. Staff institution view

Reached only via a **staff** LINE identity (§2). No New Entry tab — staff
never log cases. Two tabs instead: **Institution Cases** and **PDF**.

- **Institution Cases** reuses the same card component as the fellow's own
  Case Log — same expand-to-detail layout — but read-only (no Edit/Delete)
  and each card additionally shows **which fellow** logged it, since the list
  spans every fellow at the institution, not just one person's own cases.
  - Sourced from `staff_institution_cases()`, a database function that is the
    **only** way this data is ever read — HN masking (last 4 digits, same rule
    as the Telegram notifications) is enforced there, not in the UI, so no
    future screen can forget to apply it and leak a full HN.
  - Scoped by the **fellow's own `institution` field**, not the case's
    `place` (home/outside) — a staff member sees every case logged by every
    fellow at their institution, including those fellows' outside-institution
    cases, not "cases that physically happened at this institution."
  - Case images use the same `drive-images` function fellows use; its
    ownership check has a staff-specific fallback (`staff_can_view_image`) for
    exactly this reason — the normal "case row belongs to the caller" check is
    never true for a staff member's anonymous session.
- **PDF** offers two groupings, chosen with a segmented control, both reusing
  the same summary+content page engine as the fellow export:
  - **By month range** — one pooled document across every fellow in range,
    same shape as a fellow's own export; each case's content-page entry shows
    a chip naming which fellow logged it.
  - **By fellow** — each fellow gets their own summary + content page pair,
    back to back in a single PDF, one fellow after another.

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

Four situations post a message to a single admin Telegram chat. The bot token
is a server-side secret, so the browser never talks to Telegram itself.

- **New case logged**, **case edited**, and **case deleted** all go through the
  JWT-protected `notify-case` Edge Function. The function re-reads the case from
  the database rather than trusting the request body, so a notification always
  reflects a real stored row owned by the caller and the request can't push
  arbitrary text into the admin chat. The fellow's name and institution likewise
  come from the `fellow` table, not the client.
  - An edit reports **only the fields that changed**, as struck-through old →
    new (Telegram has no coloured text). Short values sit inline; long or
    multi-line ones stack. Images report as a count, not Drive file IDs. A save
    that changed nothing sends no message.
  - The prior values behind that diff are the one thing supplied by the client —
    only it knows the pre-update state. These are advisory notifications, not an
    audit log.
  - **Delete is the one exception to "called after the save has committed"**:
    it's called with the row still intact, right *before* `deleteCaseById` runs
    and awaited first — a deleted row can't be re-read afterward the way a
    created/updated one can be, so the message has to be built from the still-
    live row while it still exists. The reported roster count is therefore the
    current total minus one, not a fresh query after the row is actually gone.
    A delete that then fails would leave a "deleted" notification for a case
    that's technically still there — accepted as an edge case consistent with
    these being advisory, best-effort notifications, not an audit log.
- **Inbound LINE chat** goes through `line-webhook`, called by LINE rather than
  the browser. It has no Supabase session, so authenticity comes from the
  `X-Line-Signature` HMAC instead and it must be deployed with
  `--no-verify-jwt`. It reports the sender's LINE user ID in full as tappable
  `code`, plus the message quoted. Senders with no `fellow` row are labelled
  as unregistered — the common case, since anyone who finds the official account
  can message it, and that's exactly who the raw ID is needed for.
- **PHI:** Telegram is outside the app's Supabase + private-Drive perimeter, bot
  messages aren't end-to-end encrypted, and they persist in chat history and
  lock-screen previews. **HN is therefore masked to its last four digits** in
  both case notifications. Clinical text (diagnosis, procedure) is sent in full.
- Notifications are **advisory and best-effort**: they are never awaited, a
  Telegram outage can never turn into a failed save, and with the Telegram
  secrets unset every send silently no-ops so the app works without them.

## 6b. Telegram roster commands (admin)

The same bot also accepts commands, via a second webhook function,
`telegram-webhook`, so the fellow whitelist (`fellow`) can be managed from
a phone instead of the SQL editor. Two independent gates run before anything is
read or written, since that table is the access whitelist for an app holding
patient data:
1. `X-Telegram-Bot-Api-Secret-Token` header must match `TELEGRAM_WEBHOOK_SECRET`
   — proves the request came from Telegram. Set via `setWebhook`'s
   `secret_token` param; the function must be deployed with `--no-verify-jwt`,
   same as `line-webhook`.
2. The sender's numeric Telegram user id must be in `TELEGRAM_ADMIN_IDS` —
   proves it's actually an admin. Gate 1 alone only proves Telegram delivered
   the request; anyone who finds the bot can message it.

A message that fails either gate gets **no reply at all** (not "not
authorised", which would confirm to a stranger that they'd found an admin
tool) — logged server-side instead.

- **`/add name | email | institution`** — fields split on `|` rather than
  whitespace, since Thai names contain spaces and emails don't; institution is
  optional. Inserts an unverified, unlinked row — exactly the state
  `seed_fellow.sql` produces. Adding someone does **not** create a login or
  notify them; they still sign in the normal way (email → one-time code →
  optional LINE link), which is what flips them to verified. The reply echoes
  back exactly what was stored, since **the email is the login identity** — a
  typo that happens to match a real address would let that person sign in as a
  fellow, so it needs to be visible immediately, not discovered later.
  - A duplicate email is **refused**, not overwritten — the reply shows who
    already holds it (name, institution, verified) and nothing changes.
  - Email match is case-insensitive but done with `ilike` on an **escaped**
    pattern (`escapeLikePattern`), not a raw one — `_` is ordinary in an email
    address and would otherwise act as an SQL wildcard, matching the wrong row.
- **`/remove email`** — restricted to a row that has **never been signed
  into** (not verified, no linked `user_id` or `line_user_id`). This makes it a
  typo eraser that is physically incapable of removing an active fellow or
  affecting anything they've logged; the reply for a row that fails this check
  doesn't say which specific field blocked it, just that it's already real —
  fixing an active account goes through the SQL editor.
- **`/list`** — name and verified status only, **emails omitted**, so the
  roster's address list doesn't end up sitting in Telegram chat history.
- **`/addstaff name | institution | LINE user id`** — adds a row to the
  **`staff`** table (not `fellow`). All three fields are required, unlike
  `/add`: staff have no email/OTP step to link a LINE id later (§2), so the
  admin has to supply it up front — in practice, copied from the "message
  from unregistered user" notification `line-webhook` posts the first time
  that person messages the official account (§6). The row is **active
  immediately** on insert; there's no verification step to wait for. A LINE
  id already on the staff roster is refused, not overwritten — the reply
  shows who already holds it.
- The command parser and reply text are pure functions
  (`_shared/fellowCommands.ts` and `_shared/staffCommands.ts`) with no
  Deno/Supabase dependency, so they're unit-tested from the app's own vitest
  suite rather than only by hand.

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
