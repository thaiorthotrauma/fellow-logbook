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

## 3. Deploy the two Edge Functions

You'll need the [Supabase CLI](https://supabase.com/docs/guides/cli) logged
into the `pong.poti@gmail.com` account.

```sh
supabase link --project-ref dqfujzwniwtnzdtpbgrc

# LINE Login channel ID used to verify LIFF ID tokens server-side.
# Confirm this is your LINE Login *channel* ID (see caveat below).
supabase secrets set LINE_CHANNEL_ID=2010758904

# JWT secret used to sign a session for returning users (see below).
supabase secrets set SUPABASE_JWT_SECRET=<your project's JWT secret>

supabase functions deploy check-line-user
supabase functions deploy link-line-user
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by
Supabase — you don't need to set those.

**Where to find the JWT secret:** Project Settings → API → JWT Keys. Look
for a **Legacy JWT Secret** (sometimes needs "Reveal") — that's a shared
HS256 secret `check-line-user` uses to hand-sign a valid session for a
returning, already-verified fellow, so they skip straight back into the app
without a fresh email/OTP round trip. No Supabase "magic link" mechanism is
used anywhere in this app. If your project only shows the newer asymmetric
JWT Signing Keys with no legacy secret option, tell me — the function needs
adjusting for that case.

Treat this secret like a master password for your project's auth — set it
only via `supabase secrets set`, never commit it or paste it in chat.

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
   `line_user_id`; if that LINE identity is already verified, it hand-signs
   a fresh session token for the client (`supabase.auth.setSession`) — no
   email, no re-verification, no Supabase "magic link" involved.
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
