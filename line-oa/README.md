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

## Cover photo

[`cover-photo.png`](./cover-photo.png) — 1080×787px, ~500KB (well under
LINE's 3MB limit), shown on the Official Account's profile page.

Same brand language as the rich menu (teal gradient, decorative rings) plus
a "TOTS" seal/monogram, title, and a short academic-toned subtitle. Content
is centered with a clear margin at the bottom — LINE overlays the OA's
circular profile photo there, so nothing essential sits in that zone.

**To upload:** LINE Developers Console → your channel → **Messaging API**
tab → **LINE Official Account settings** (or the OA Manager at
[manager.line.biz](https://manager.line.biz)) → **Home** → edit cover photo
→ upload `cover-photo.png` directly. This one has no API endpoint — it's
set through the console/OA Manager UI, not `curl`.
