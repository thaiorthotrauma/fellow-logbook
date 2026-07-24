# Backend & LINE Login Setup

This app authenticates fellows through LINE (via LIFF) and a physician
whitelist stored in Supabase. Since this Supabase project is on a different
account than the one connected to this session, the steps below need to be
run manually by you.

## 1. Database schema

Open your Supabase project → **SQL Editor** → New query, paste in the
contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it.

This creates:
- `public.physicians` — the whitelist (`full_name`, `email`, `institution`,
  `line_user_id`, `verified`). Seeded with the admin row
  (`pong.poti@gmail.com`).
- `public.cases` — the actual logbook entries, RLS-scoped so each physician
  only sees their own.
- `is_email_allowed(email)` — a public RPC used to check the whitelist
  without exposing it.
- `claim_physician_row()` — links a freshly-authenticated Supabase user to
  their whitelist row by email.

Then load the fellow roster: paste in and run
[`supabase/seed_physicians.sql`](./supabase/seed_physicians.sql). Safe to
re-run any time the roster changes — it upserts by email.

Case images (the New Entry "Images" field, Question 11) are **not** stored in
Supabase — they upload to a private Google Drive via the `drive-images` Edge
Function. See [§3](#3-deploy-the-edge-functions) and
[§3a](#3a-google-drive-for-case-images) below. No storage bucket or SQL is
needed for images.

## 2. Configure Supabase Auth email OTP

Every fellow's *first* login creates their Supabase Auth account on the spot
(`signInWithOtp` with `shouldCreateUser: true`), so the email that actually
goes out uses the **Confirm signup** template, not Magic Link. Go to
**Authentication → Email Templates → Confirm signup** and make sure it
includes `{{ .Token }}` (the 6-digit code), not just
`{{ .ConfirmationURL }}` — we want users to type a code, not tap a link,
since they're inside the LINE in-app browser.

A branded template matching the app's look is at
[`supabase/email-templates/otp-email.html`](./supabase/email-templates/otp-email.html)
— paste its contents into the **Confirm signup** template's HTML source (it
already contains `{{ .Token }}` where the code should render). The Magic
Link template is not used anywhere in this app's flow and doesn't need
editing.

Also check **Authentication → Rate Limits**: Supabase's default built-in
email sender allows only a handful of emails/hour. Fine for a small fellow
roster; if you outgrow it, attach a custom SMTP provider (e.g. Resend) under
**Authentication → SMTP Settings**.

## 3. Deploy the Edge Functions

You'll need the [Supabase CLI](https://supabase.com/docs/guides/cli) logged
into the `pong.poti@gmail.com` account.

```sh
supabase link --project-ref dqfujzwniwtnzdtpbgrc

# LINE Login channel ID used to verify LIFF ID tokens server-side.
# Confirm this is your LINE Login *channel* ID (see caveat below).
supabase secrets set LINE_CHANNEL_ID=2010758904

supabase functions deploy check-line-user
supabase functions deploy link-line-user
supabase functions deploy drive-images   # see §3a for its Google secrets
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically by Supabase — you don't need to set those.

**If you migrate the project to JWT Signing Keys (ES256):** the auto-injected
`SUPABASE_SERVICE_ROLE_KEY` (a legacy JWT) can stop verifying (`bad_jwt` /
"unrecognized kid ES256"), which breaks `check-line-user` / `link-line-user`
(they call the Auth admin API). Fix: from **Project Settings → API keys**, copy
the new **Secret key** (`sb_secret_…`) and set it, then redeploy those two
functions:

```sh
supabase secrets set SB_SECRET_KEY=sb_secret_xxxxxxxx
supabase functions deploy check-line-user
supabase functions deploy link-line-user
```

The functions use `SB_SECRET_KEY` when present and fall back to the injected
service_role key otherwise. (`drive-images` is unaffected — it uses the
caller's token, not the service role.)

## 3a. Google Drive for case images

Case images upload to a single private Google Drive (yours) through the
`drive-images` function. The browser can't talk to Google directly — Google's
OAuth flow is blocked inside LINE's in-app webview — so the function holds one
long-lived refresh token and does the uploads/reads/deletes on the fellow's
behalf. Images are resized on-device before upload but not otherwise altered
— there is no annotation-removal step.

One-time Google setup (personal Gmail is fine):

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a
   project and **enable the Google Drive API**.
2. **APIs & Services → OAuth consent screen**: external, add scope
   `https://www.googleapis.com/auth/drive.file` (least-privilege — the app can
   only see files it creates, so Google won't require app verification), then
   **publish the app to Production** (in "Testing" mode refresh tokens expire
   after 7 days).
3. **Credentials → Create OAuth client ID → Web application**. Note the
   **Client ID** and **Client Secret**.
4. Use the [OAuth Playground](https://developers.google.com/oauthplayground/)
   (gear icon → "Use your own OAuth credentials") to authorize the
   `drive.file` scope and exchange the code for a **refresh token**.
5. (Optional) Create a folder in your Drive to hold all case images and copy
   its **folder ID** from the URL. Omit to upload to the Drive root.

Then set the secrets (run from your machine — **do not paste these in chat**):

```sh
supabase secrets set GOOGLE_CLIENT_ID=...
supabase secrets set GOOGLE_CLIENT_SECRET=...
supabase secrets set GOOGLE_REFRESH_TOKEN=...
supabase secrets set GOOGLE_DRIVE_FOLDER_ID=...   # optional
supabase functions deploy drive-images            # redeploy after setting secrets
```

Until these are set, cases save fine — only cases *with images* will error.

## 4. LINE Developers console

- Confirm `2010758904` is correct. **LIFF IDs and LINE Login channel IDs are
  different values** — a LIFF ID normally looks like
  `2010758904-AbCdEfGh` (channel id + a suffix), while what you gave me looks
  like a bare channel ID. Double check in the LINE Developers console under
  your channel's **LIFF** tab and send me the full LIFF ID if it differs —
  `VITE_LIFF_ID` needs the full value.
- Under your LIFF app's settings, set the **Endpoint URL** to wherever you
  deploy this app (e.g. your Vercel/Netlify URL).
- Under **LINE Login → Scopes**, make sure `openid` and `email` are enabled
  — the app needs the ID token's `sub` claim, and email is not strictly
  required by us but doesn't hurt to enable.

## 5. Environment variables

Copy `.env.example` to `.env` (already done for local dev with the values
you gave me) and set the same three variables in your hosting provider
(Vercel/Netlify/etc.) for production:

```
VITE_SUPABASE_URL=https://dqfujzwniwtnzdtpbgrc.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_HZ4Qegw_fnzfq7TyLi3Iiw_yN2L0e6i
VITE_LIFF_ID=<confirm/replace with the full LIFF ID>
```

## How the login flow works

1. App loads inside LIFF, gets the user's signed LINE ID token.
2. If a Supabase session is already cached in the browser, skip straight
   in (fast path for returning users on the same device).
3. Otherwise, calls the `check-line-user` Edge Function with the ID token.
   It verifies the token with LINE, looks up `physicians` by
   `line_user_id`; if that LINE identity is already verified, it generates a
   redeemable token server-side (via Supabase's admin API — internally
   labeled `type: 'magiclink'`, but no email is sent) and the client
   redeems it into a real session with `supabase.auth.verifyOtp`. No
   re-verification needed.
4. If unlinked, shows the **email entry screen**. The email is checked
   against the whitelist (`is_email_allowed`); no match → hard rejection
   screen ("Email Not Found"). Match → Supabase sends a 6-digit email OTP
   (via the Confirm signup template, since this creates their Auth account).
5. User enters the code in the 6-box OTP input (`OtpStep`/`OtpInput`) →
   `supabase.auth.verifyOtp` establishes a real session →
   `claim_physician_row()` links `auth.uid()` to the whitelist row →
   `link-line-user` Edge Function re-verifies the LIFF ID token server-side
   and stores `line_user_id` + `verified = true`.
6. From then on, that LINE account skips straight to step 3's fast path.
