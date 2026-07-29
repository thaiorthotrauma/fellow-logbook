# Telegram error notifications — message layout

Design proposal. Nothing here is implemented yet; this fixes the message shape
before code is written. Companion to `BEHAVIORS.md` §6a–6c, which describe the
Telegram messages the bot already sends.

Today every failure in the app ends at `console.error` — roughly forty sites
across `src/` and `supabase/functions/`. This routes all of them to the same
admin chat that already receives case notifications.

## Severity tiers

| Tier | Emoji | Means |
| --- | --- | --- |
| Error | 🔴 | The action failed. Someone saw it fail, or a server path threw. |
| Degraded | 🟠 | A fallback absorbed it. Nothing visibly broke, but it should be known. |
| Rejected | 🛡 | An auth, signature or allowlist gate turned a request away. Not a bug. |
| Repeating | 🔁 | Rollup emitted while a fingerprint is muted. |

## The envelope

Nine parts, in fixed order. Empty blocks are omitted entirely — the rule
`block()` in `_shared/caseMessage.ts` already follows.

```
{emoji} <b>{class} · {component}</b>
{origin} · {dd MMM yyyy, HH:mm} (+07)

<b>Error</b>
{describeError(err), 400 chars}

<b>Who</b>
{name} · {institution}

<b>Where</b>
{route / call site}

<b>Context</b>
{label} {value}
{label} <code>{value}</code>

<blockquote expandable>{stack, 3000 chars}</blockquote>

<code>{fingerprint}</code> · {occurrence}
```

- **Headline** — severity, class and component, sized to survive a lock-screen
  notification preview without truncating.
- **Origin** — which of the six surfaces reported it, timestamped in +07, the
  clock the fellows and staff work on.
- **Error** — the message alone, no stack. `describeError()` already unpacks
  Postgres `message / details / hint / code`.
- **Who** — resolved server-side from the roster, never from the request body.
  Dropped when the failure precedes identification.
- **Where** — route, function and call site: enough to open the right file.
- **Context** — 2–4 surface-specific lines. Never patient data.
- **Detail** — stack or raw response in an `expandable` blockquote, collapsed by
  default so one stack can't push the next alert off screen.
- **Fingerprint** — six hex chars over *surface + call site + normalised
  message*. The same bug always carries the same code.
- **Occurrence** — `1st`, `2nd in 5 min`, `muted until 15:33`.

Parse mode is `HTML`, as with every existing message. Every interpolated value
goes through `esc()`: an error string containing `<` or `&` would otherwise be
rejected as malformed entities and lost — a poor way for an error reporter to
fail.

## Worked examples

### 1. Frontend — a save failed

```
🔴 App error · Save case
Frontend · 2 Aug 2026, 14:32 (+07)

Error
Failed to fetch

Who
ปองสิทธิ์ โพธิคุณ · สมุทรสาคร

Where
New Entry → saveCase → drive-images (upload)

Context
3 images · 4.1 MB
iOS 18.5 · LINE 15.2.0 · LIFF
Build bcbfd6a

▸ TypeError: Failed to fetch
      at invokeDrive (casesApi.ts:41:33)
      at async saveCase (casesApi.ts:99:5)

a1f3c9 · 1st
```

`Build` is the commit the browser is running — a stale cached bundle is a real
failure mode inside the LINE in-app browser. The device line matters for the
same reason: the PDF-export bugs in this repo were all context-specific.

### 2. Frontend — degraded

```
🟠 Degraded · HEIC conversion
Frontend · 2 Aug 2026, 14:31 (+07)

Error
heic2any: format not supported

Who
ปองสิทธิ์ โพธิคุณ · สมุทรสาคร

Where
convertHeic → kept the original file

Context
3.2 MB HEIC · upload continued
iOS 18.5 · LINE 15.2.0 · LIFF

7c02be · 4th in 30 min
```

Covers the paths that already have a fallback: `heic.ts`, `imageResize.ts`,
`pdf/classifyRegion.ts`, `pdf/generate.ts`'s share→download fallback. Nobody
reports these because nothing visibly broke — but four in half an hour means a
phone model is failing.

### 3. Postgres

```
🔴 Database error · cases
Postgres via notify-case · 2 Aug 2026, 14:35 (+07)

Error
new row violates row-level security policy for table "cases" — (42501)

Who
ปองสิทธิ์ โพธิคุณ · สมุทรสาคร

Where
insert into cases · policy cases_insert_own

Context
Detail withheld (contains row values)
Responded 500

9d4417 · 1st
```

There is no database-side reporter and none is needed: the schema has no
triggers and no cron — every function is `SECURITY DEFINER`, called from a
request — so a database error always surfaces at a caller and is reported by
that caller, with `Postgres via …` as its origin.

**Postgres `detail` is never sent.** On a constraint or RLS failure it reads
"Failing row contains (…)" — the entire row, HN and diagnosis included.

### 4. Edge Function threw

```
🔴 Function error · classify-region
Edge Function · 2 Aug 2026, 14:36 (+07)

Error
DeepSeek API error: 402 Insufficient Balance

Who
Ratchanon W. · ราชวิถี (staff)

Where
POST classify-region · 46 labels

Context
Responded 500 after 1.2 s
PDF export fell back to raw labels

▸ Error: DeepSeek API error: 402 {"error":{"me…
      at callDeepSeek (classify-region/index.ts:185)
      at Object.handler (classify-region/index.ts:88)

5b8e10 · 3rd in 12 min
```

`Responded` tells you whether the caller saw an error or the app absorbed it.
The consequence line names what degraded when a function's failure is designed
to be survivable.

### 5. LINE API

```
🔴 LINE API error · Rich menu
LINE via telegram-webhook · 2 Aug 2026, 14:40 (+07)

Error
LINE richmenu link failed: 404 The rich menu ID is invalid

Where
linkRichMenu → POST /v2/bot/user/{id}/richmenu/{menu}

Context
Staff added by /addstaff — menu not assigned
LINE user U4af49807…
Rich menu richmenu-8f3a…
Failed all 3 attempts

b6f7d2 · 1st
```

`fetchWithRetry` already logs each attempt to a console nobody reads; the alert
reports the final tally instead. The LINE user ID goes in full, tappable as
`code` — the same choice §6a made for inbound chat.

### 6. LINE webhook — rejected

```
🛡 Rejected · LINE webhook
LINE webhook · 2 Aug 2026, 14:41 (+07)

Reason
X-Line-Signature did not match

Context
Signature present but wrong
412-byte body · answered 401
From 203.0.113.44

c1e5a8 · 9th in 5 min — muted until 15:41
```

Also covers a wrong `X-Telegram-Bot-Api-Secret-Token`, a command from an ID
outside `TELEGRAM_ADMIN_IDS`, a bad Mini App `initData` signature, and any
function called without a valid session.

A tier of its own because nothing is broken — a gate did its job, and marking
that red trains you to ignore red. One is noise; nine in five minutes is
someone probing, which is why the count shares the line.

The rejected body, the supplied signature and the attempted token are never
sent: a failed secret is still a secret guess. Only *present / absent /
mismatched* is reported.

### 7. Telegram itself

```
🟠 Telegram delivery gap
Notifier · 2 Aug 2026, 14:46 (+07)

Error
telegram 429: Too Many Requests, retry after 31

Context
3 messages lost between 14:22 and 14:26
· 1 new case logged
· 1 function error · drive-images
· 1 degraded · region classification

Sending has recovered.

f0c73d · 1st
```

The one failure that cannot be reported through the channel it is about. A
failed send appends its headline to a small in-memory buffer; the next send
that *succeeds* emits this summary first. No retry queue and no storage — the
alert is that a gap happened, not a replay of its contents.

Limits, stated plainly: an isolate recycled before recovery loses its buffer,
and a total Telegram outage is invisible by construction. Both are accepted —
these are advisory notifications, not an audit log, the standing §6a already
sets, and every alert is also a `console.error`, so Supabase's function logs
stay the system of record.

A failed error-report send is only ever buffered, never itself reported. One
flag on the send path makes that structural rather than a convention.

### 8. Rollup

```
🔁 Repeating · Function error · drive-images
Edge Function · 2 Aug 2026, 15:33 (+07)

Error
Drive upload failed: 403 Rate Limit Exceeded

Context
47 more since 14:33 — 3 fellows affected
Last seen 15:31

Muting for another hour.

3e91ab
```

## Flood control

- The first **three** occurrences of a fingerprint send in full — enough to see
  whether it is one fellow or everyone.
- Then muted for **60 minutes**. The third message's occurrence line says so,
  so the silence is never ambiguous.
- One rollup when the window closes, with the count, the spread across fellows,
  and the time last seen. Still going means it re-mutes and says so.
- **40 alerts per hour** globally. Past that, only rollups — a storm must never
  drown out a case being logged.
- Frontend reports are capped harder and headed `App error · unverified` when
  they arrive without a session.
- Counters live in a small `error_events` table. Isolates are recycled, so
  in-memory counting would reset mid-storm and defeat the mute.

## Routing

| Surface | Caught by | Path to Telegram | Tiers |
| --- | --- | --- | --- |
| Frontend | `window.onerror` + `unhandledrejection` in `main.tsx`, plus `reportError()` at each existing catch | POST `log-error` → `sendTelegram`. Deployed `--no-verify-jwt`; identity read from the session when one exists | 🔴 🟠 |
| Edge Functions (all eight) | `withErrorReport()` around the existing `Deno.serve` handler | Direct `sendTelegram`, fire-and-forget | 🔴 🛡 |
| Postgres | The `PostgrestError` at whichever caller made the query | Inherits its caller's path; origin reads `Postgres via …` | 🔴 |
| LINE API (outbound) | Throws out of `fetchWithRetry` in `_shared/line.ts` | Caught by the calling function's wrapper | 🔴 |
| LINE webhook (inbound) | Its own signature gate and top-level catch | Direct `sendTelegram`; still answers `200` so LINE won't disable the hook | 🔴 🛡 |
| Telegram | `SendResult.sent === false` | Buffered; emitted by the next successful send | 🟠 |

Reporting is never awaited and its own failure is always caught. The existing
promise — a Telegram outage must never turn into a failed save — is unchanged.

## Redaction

Error payloads are riskier than case notifications: a stack or a Postgres
`detail` can drag an entire row along with it.

**Never sent**

- **HN** — not even masked. A case notification masks it because it is the
  point; an error has no reason to carry it at all.
- **Clinical free text** — diagnosis, procedure, approach, position, memo,
  other classification.
- **Postgres `detail`**, which embeds the failing row verbatim.
- **Email addresses and OTP codes.**
- **Secrets** — bot token, service-role key, Google refresh token, LINE channel
  secret, any `Authorization` header. Scrubbed by pattern before send, not by
  remembering to leave them out.
- **Rejected request bodies** and attempted signatures.

**Sent**

- Error message, code and hint, via `describeError()`.
- Stack traces, in an expandable quote, capped at 3 000 chars.
- Fellow or staff name and institution — already in every case notification.
- LINE user ID in full, consistent with §6a: for someone with no roster row it
  is the only handle there is.
- Case ID (a UUID, not patient data), image *counts*, file sizes, HTTP
  statuses, durations, build SHA, device and app versions.
- Third-party response bodies (Google, DeepSeek, LINE), truncated to 300 chars.

## Testing

Message builders go in a Deno-free module so the app's own Vitest suite can
assert on the exact output, the way `notify.test.ts` already does for the four
case messages.
