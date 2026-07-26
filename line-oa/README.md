# LINE Official Account Assets — Fellow Logbook

A single full-image rich menu whose only tap area opens the app via LIFF.
Designed to match the app's header theme: a bolder teal gradient, three
concentric decorative rings for depth, and a logbook/checkmark icon plus
an "Open Logbook" pill button — both enlarged (button further sized up), in one evenly-spread row,
no additional title/subtitle text.

- **Image:** [`richmenu-logbook.jpg`](./richmenu-logbook.jpg) — 2500×843px
  (LINE's "compact" size), ~98KB.
- Since this session's network policy blocks `api.line.me` directly, the
  create/upload/set-default calls below need to be run from your machine
  (or anywhere with normal internet access) using `curl`.

## Prerequisites

- Your **Channel Access Token** (long-lived, from LINE Developers Console →
  Messaging API tab). Treat it like a password — don't paste it in chat
  again; if it was already exposed once, reissue it there when you're done.
- Your **full LIFF ID** (format `channelid-suffix`, e.g. `2010758904-AbCdEfGh`)
  — confirm this in the LINE Developers Console under your channel's LIFF tab.

Set them as shell variables so you don't retype them:

```sh
export CHANNEL_TOKEN="<your channel access token>"
export LIFF_URL="https://liff.line.me/<your-full-liff-id>"
```

## 1. Create the rich menu

```sh
curl -v -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $CHANNEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "size": { "width": 2500, "height": 843 },
    "selected": true,
    "name": "Fellow Logbook — open app",
    "chatBarText": "Open Logbook",
    "areas": [
      {
        "bounds": { "x": 0, "y": 0, "width": 2500, "height": 843 },
        "action": { "type": "uri", "label": "Open Logbook", "uri": "'"$LIFF_URL"'" }
      }
    ]
  }'
```

Response returns a `richMenuId` — save it:

```sh
export RICH_MENU_ID="richmenu-xxxxxxxxxxxxxxxxxxxx"
```

## 2. Upload the image

Run this from the repo root (or wherever you copied `richmenu-logbook.jpg`):

```sh
curl -v -X POST "https://api-data.line.me/v2/bot/richmenu/$RICH_MENU_ID/content" \
  -H "Authorization: Bearer $CHANNEL_TOKEN" \
  -H "Content-Type: image/jpeg" \
  --data-binary @line-oa/richmenu-logbook.jpg
```

## 3. Set it as the default for everyone

This is what makes it apply automatically to all users (existing and new)
without them doing anything — no per-user selection needed:

```sh
curl -v -X POST "https://api.line.me/v2/bot/user/all/richmenu/$RICH_MENU_ID" \
  -H "Authorization: Bearer $CHANNEL_TOKEN"
```

## 4. Verify

```sh
curl -s https://api.line.me/v2/bot/user/all/richmenu \
  -H "Authorization: Bearer $CHANNEL_TOKEN"
```

Should return `{"richMenuId":"richmenu-..."}` matching what you just set.

Open a chat with the OA (or reopen an existing one) — the rich menu should
show **already expanded** at the bottom, tapping anywhere opens the logbook.
`"selected": true` in step 1 is what makes it appear expanded by default
rather than collapsed/minimized.

## Regenerating the rich menu image

The image was rendered from a small HTML/CSS mockup (teal gradient +
inline SVG book/check icon + self-hosted IBM Plex Sans, matching the app's
own header) via a headless browser screenshot, then exported as JPEG to
stay under LINE's 1MB limit. If you want to tweak the design, ask and it
can be regenerated the same way.

---

## Staff rich menu (per-user, not the default)

A second rich menu, shown **only** to verified staff — everyone else keeps
seeing the default one above. Two tap areas side by side: **Fellow Cases**
(left, amber) opens the staff institution view; **Logbook Demo** (right,
teal) opens a disabled preview of the fellow experience with no real data.
Same 2500×843 size as the default menu.

- **Image:** [`richmenu-staff.jpg`](./richmenu-staff.jpg) — 2500×843px, ~94KB.
- Reuses the same `$CHANNEL_TOKEN` and `$LIFF_URL` shell variables set above
  — no new prerequisite.
- Unlike the default menu, this one is **never** set for "all users" — it's
  assigned to specific LINE ids one at a time (step 3 below), which is what
  keeps it staff-only.

### 1. Create the rich menu

```sh
curl -v -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $CHANNEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "size": { "width": 2500, "height": 843 },
    "selected": true,
    "name": "Fellow Logbook — staff menu",
    "chatBarText": "Staff Menu",
    "areas": [
      {
        "bounds": { "x": 0, "y": 0, "width": 1250, "height": 843 },
        "action": { "type": "uri", "label": "Fellow Cases", "uri": "'"$LIFF_URL"'?view=staff" }
      },
      {
        "bounds": { "x": 1250, "y": 0, "width": 1250, "height": 843 },
        "action": { "type": "uri", "label": "Logbook Demo", "uri": "'"$LIFF_URL"'?view=demo" }
      }
    ]
  }'
```

Save the returned id under a different variable from the default menu's, so
you don't overwrite it:

```sh
export STAFF_RICH_MENU_ID="richmenu-xxxxxxxxxxxxxxxxxxxx"
```

### 2. Upload the image

```sh
curl -v -X POST "https://api-data.line.me/v2/bot/richmenu/$STAFF_RICH_MENU_ID/content" \
  -H "Authorization: Bearer $CHANNEL_TOKEN" \
  -H "Content-Type: image/jpeg" \
  --data-binary @line-oa/richmenu-staff.jpg
```

### 3. Assign it to a specific staff member

Repeat this once per staff LINE user id — this is what makes it staff-only;
skipping this step for someone means they keep seeing the default menu.

```sh
curl -v -X POST "https://api.line.me/v2/bot/user/<their LINE user id>/richmenu/$STAFF_RICH_MENU_ID" \
  -H "Authorization: Bearer $CHANNEL_TOKEN"
```

To remove someone's staff menu later (e.g. they're no longer staff) without
touching anyone else's, unlink just that one id — this reverts them to
whatever the default menu is, it does not delete the staff menu itself:

```sh
curl -v -X DELETE "https://api.line.me/v2/bot/user/<their LINE user id>/richmenu" \
  -H "Authorization: Bearer $CHANNEL_TOKEN"
```

### 4. Verify

```sh
curl -s "https://api.line.me/v2/bot/user/<their LINE user id>/richmenu" \
  -H "Authorization: Bearer $CHANNEL_TOKEN"
```

Should return `{"richMenuId":"..."}` matching `$STAFF_RICH_MENU_ID` for a
staff id, or the default menu's id for anyone else.

**Note:** this step-3 assignment is manual today — done once per person, right
after adding them to the `staff` table (see `supabase/seed_staff.sql`). If the
roster grows past a handful of people, this is a natural candidate for a
future Telegram `/addstaff` command to automate (mirroring the existing
`/add` roster command), the same way step 3 could eventually be triggered
automatically instead of by hand.

---

## Cover photo

[`cover-photo.png`](./cover-photo.png) — 1080×787px, ~430KB (well under
LINE's 3MB limit), shown on the Official Account's profile page.

Background only — same brand language as the rich menu (teal gradient,
decorative rings), no text or other components.

**To upload:** LINE Developers Console → your channel → **Messaging API**
tab → **LINE Official Account settings** (or the OA Manager at
[manager.line.biz](https://manager.line.biz)) → **Home** → edit cover photo
→ upload `cover-photo.png` directly. This one has no API endpoint — it's
set through the console/OA Manager UI, not `curl`.
