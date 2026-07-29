// Reports a failure to the admin Telegram chat.
//
// Every Edge Function ends in the same `catch (err) { console.error(err) }`,
// which reaches a console nobody reads. reportFunctionError() goes next to
// that line so the same catch also raises an alert. No response path changes:
// each function keeps its own control flow and keeps answering exactly as it
// did — notify-case still 200s, line-webhook still says 'ok' so LINE won't
// disable the webhook.
//
// Reporting is never awaited by the work it describes and its own failure is
// always caught, so the standing promise holds — a Telegram problem can never
// turn into a failed save.
//
// Required secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, and a service-role
// key (SB_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY) for the flood-control
// counters. Without the key, reporting degrades OPEN — every occurrence is
// sent — because losing alerts is worse than repeating them.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { sendTelegram, telegramConfigured } from './telegram.ts';
import {
  budgetReachedMessage,
  errorMessage,
  occurrenceLine,
  rollupMessage,
  type ContextLine,
  type ErrorReport,
  type Severity,
  MAX_MESSAGE,
} from './errorMessage.ts';
import {
  describeError,
  fingerprint,
  hasWithheldDetail,
  redact,
  stackOf,
  truncate,
} from './errorText.ts';

export type { ContextLine, Severity };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function serviceRoleKey(): string {
  return (
    Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  ).trim();
}

/** What a caller describes. Everything else — timestamp, fingerprint,
 *  occurrence, redaction — is added here so no call site can forget it. */
export interface ReportInput {
  /** Defaults to 'error'. */
  severity?: Severity;
  /** Failure class: 'Function error', 'Database error', 'LINE API error'. */
  kind: string;
  component?: string | null;
  origin: string;
  /** The thrown value, or a ready-made string for a rejection. */
  error: unknown;
  who?: string | null;
  where?: string | null;
  context?: ContextLine[];
  /** Overrides the stack pulled off `error`; pass null to send none. */
  detail?: string | null;
  /** Full sends before the fingerprint is muted. Defaults to 3; the
   *  unauthenticated frontend path uses 1. */
  fullSends?: number;
}

interface GateResult {
  decision: 'send' | 'muted' | 'budget';
  occurrences: number;
  sent: number;
  window_started_at: string;
  muted_until: string | null;
  budget_reached: boolean;
  budget_resumes_at: string;
  rollups: Array<{
    fingerprint: string;
    headline: string;
    origin: string;
    message: string;
    suppressed: number;
    since: string;
    last_seen: string;
    people_affected: number;
    still_muted: boolean;
  }>;
}

function adminClient(): SupabaseClient | null {
  const key = serviceRoleKey();
  if (!SUPABASE_URL || !key) return null;
  return createClient(SUPABASE_URL, key);
}

/** Sends one failure to the admin chat, subject to flood control.
 *
 *  Never throws and never rejects: it is called from catch blocks, and a
 *  reporter that can itself fail the request it is reporting on is worse than
 *  no reporter. Returns whether a message actually went out, which is only of
 *  interest to the tests. */
export async function reportError(input: ReportInput): Promise<boolean> {
  try {
    if (!telegramConfigured()) return false;

    const raw = typeof input.error === 'string' ? input.error : describeError(input.error);
    const message = truncate(redact(raw), MAX_MESSAGE);
    const where = input.where ? redact(input.where) : null;
    const headline = input.component ? `${input.kind} · ${input.component}` : input.kind;

    const context: ContextLine[] = (input.context ?? []).map(line =>
      Array.isArray(line)
        ? ([line[0], redact(line[1])] as [string, string])
        : redact(line),
    );
    // Say that a Postgres detail existed rather than dropping it silently:
    // its absence is a deliberate rule, not an oversight (TELEGRAM_ERRORS.md).
    if (hasWithheldDetail(input.error)) {
      context.push('Detail withheld (contains row values)');
    }

    const detail =
      input.detail === null
        ? null
        : redact(input.detail ?? stackOf(input.error) ?? '') || null;

    const fp = await fingerprint(input.origin, where ?? headline, message);
    const gate = await runGate(
      fp,
      headline,
      input.origin,
      message,
      input.who ?? null,
      input.fullSends ?? 3,
    );

    // Rollups first: they close a window that ended before this happened.
    for (const rollup of gate?.rollups ?? []) {
      await sendTelegram(
        rollupMessage({
          fingerprint: rollup.fingerprint,
          headline: rollup.headline,
          origin: rollup.origin,
          message: rollup.message,
          suppressed: rollup.suppressed,
          since: new Date(rollup.since),
          lastSeen: new Date(rollup.last_seen),
          peopleAffected: rollup.people_affected,
          stillMuted: rollup.still_muted,
        }),
      );
    }

    if (gate && gate.decision !== 'send') return false;

    const now = new Date();
    const report: ErrorReport = {
      severity: input.severity ?? 'error',
      kind: input.kind,
      component: input.component ?? null,
      origin: input.origin,
      message,
      who: input.who ?? null,
      where,
      context,
      detail,
      fingerprint: fp,
      occurrence: gate
        ? occurrenceLine(
            gate.occurrences,
            new Date(gate.window_started_at),
            now,
            gate.muted_until ? new Date(gate.muted_until) : null,
          )
        : null,
      at: now,
    };

    const result = await sendTelegram(errorMessage(report));
    if (!result.sent) console.error('Error notification failed:', result.error);

    if (gate?.budget_reached) {
      await sendTelegram(budgetReachedMessage(40, new Date(gate.budget_resumes_at), now));
    }
    return result.sent;
  } catch (err) {
    // The reporter is the last thing that may take the request down with it.
    console.error('Error notification failed:', err);
    return false;
  }
}

/** Asks Postgres whether this occurrence should be sent. Returns null when
 *  the counters are unreachable, which the caller treats as "send" — an
 *  alerting system that goes quiet because its bookkeeping broke is the one
 *  failure mode worth avoiding at the cost of duplicates. */
async function runGate(
  fp: string,
  headline: string,
  origin: string,
  message: string,
  person: string | null,
  fullSends: number,
): Promise<GateResult | null> {
  const admin = adminClient();
  if (!admin) return null;
  try {
    const { data, error } = await admin.rpc('error_gate', {
      p_fingerprint: fp,
      p_headline: headline,
      p_origin: origin,
      p_message: message,
      p_person: person,
      p_full_sends: fullSends,
    });
    if (error) {
      console.error('error_gate failed, sending unthrottled:', error.message);
      return null;
    }
    return data as GateResult;
  } catch (err) {
    console.error('error_gate failed, sending unthrottled:', err);
    return null;
  }
}

/** Reports a request that a gate turned away. Its own tier, because nothing
 *  is broken — marking a working signature check red would train you to
 *  ignore red. The rejected body, the supplied signature and the attempted
 *  token are never included: a failed secret is still a secret guess. */
export function reportRejected(
  component: string,
  origin: string,
  reason: string,
  context: ContextLine[] = [],
): Promise<boolean> {
  return reportError({
    severity: 'rejected',
    kind: 'Rejected',
    component,
    origin,
    error: reason,
    context,
    detail: null,
  });
}

/** A PostgrestError rather than a thrown Error: a plain object carrying
 *  `code`/`details`/`hint` and no stack. Worth telling apart, because a
 *  database rejection and a bug in the function want different headlines —
 *  one sends you to schema.sql, the other to the handler. */
function isDatabaseError(err: unknown): boolean {
  if (err == null || typeof err !== 'object' || err instanceof Error) return false;
  const o = err as Record<string, unknown>;
  return typeof o.code === 'string' && typeof o.message === 'string';
}

/** Postgres names the table in its own message ("... for table \"cases\"").
 *  Pulling it out puts the thing that was rejected in the headline, where a
 *  function name would otherwise say only where you were standing. */
function tableOf(message: string): string | null {
  return /\btable "([A-Za-z0-9_]+)"/.exec(message)?.[1] ?? null;
}

/** LINE failures are thrown from _shared/line.ts and surface in whichever
 *  function happened to call it, so without this they'd all be filed as bugs
 *  in check-line-user. The message shape is set in one place (line.ts), which
 *  is what makes matching on it safe. */
const LINE_FAILURES: Array<[RegExp, string]> = [
  [/^LINE richmenu link failed/, 'Rich menu'],
  [/^LINE id_token verification/, 'ID token'],
];

function lineComponentOf(message: string): string | null {
  for (const [pattern, component] of LINE_FAILURES) {
    if (pattern.test(message)) return component;
  }
  return null;
}

/** Reports whatever an Edge Function's top-level catch caught.
 *
 *  Called from inside the existing catch, next to the console.error that is
 *  already there — the functions keep their own control flow and keep
 *  answering exactly as they did. Never awaited: the caller is waiting on a
 *  response, and reportError swallows its own failures.
 *
 *  A database rejection is re-headed automatically, so an RLS policy failing
 *  inside notify-case reads "Database error · cases / Postgres via
 *  notify-case" rather than being filed under the function that noticed. */
export function reportFunctionError(
  component: string,
  err: unknown,
  extra: {
    where?: string;
    who?: string | null;
    context?: ContextLine[];
    /** 'degraded' when the function's own failure is designed to be
     *  survivable and the caller carried on regardless. */
    severity?: Severity;
  } = {},
): void {
  const database = isDatabaseError(err);
  const message = describeError(err);
  const line = database ? null : lineComponentOf(message);

  let kind = 'Function error';
  let headlineComponent = component;
  let origin = 'Edge Function';
  if (database) {
    kind = 'Database error';
    headlineComponent = tableOf(message) ?? component;
    origin = `Postgres via ${component}`;
  } else if (line) {
    kind = 'LINE API error';
    headlineComponent = line;
    origin = `LINE via ${component}`;
  }

  void reportError({
    severity: extra.severity,
    kind,
    component: headlineComponent,
    origin,
    error: err,
    who: extra.who ?? null,
    where: extra.where ?? component,
    context: extra.context,
  });
}
