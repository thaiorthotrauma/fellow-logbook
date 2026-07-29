// Builds the Telegram message bodies for error notifications — the layout
// specified in TELEGRAM_ERRORS.md.
//
// Every failure in the app, whichever of the six surfaces it came from,
// renders into one envelope so triage on a phone is a glance rather than a
// read. Blocks with no value are omitted entirely, the same rule block() in
// caseMessage.ts follows, so a thin error stays thin.
//
// Plain TypeScript with no Deno dependency, so the exact output is asserted
// from the app's own Vitest suite (src/lib/errorMessage.test.ts).

import { esc } from './html.ts';
import { truncate } from './errorText.ts';

/** How loud the message is. The tiers exist so that red keeps meaning
 *  something: a rejected signature is not a bug, and a fallback that worked
 *  is not an outage. */
export type Severity = 'error' | 'degraded' | 'rejected' | 'repeating' | 'muted';

const EMOJI: Record<Severity, string> = {
  error: '🔴',
  degraded: '🟠',
  rejected: '🛡',
  repeating: '🔁',
  muted: '🔇',
};

/** 'Error' for most tiers; a rejection reports a Reason, because nothing
 *  went wrong — a gate did its job. */
const MESSAGE_LABEL: Record<Severity, string> = {
  error: 'Error',
  degraded: 'Error',
  rejected: 'Reason',
  repeating: 'Error',
  muted: 'Reason',
};

/** A context line: plain text, or a label with a value set as tappable
 *  `code` (ids you'll want to copy — a LINE user id, a request id). */
export type ContextLine = string | [label: string, value: string];

export interface ErrorReport {
  severity: Severity;
  /** Failure class, e.g. 'Function error', 'App error', 'Database error'. */
  kind: string;
  /** What failed, e.g. 'drive-images', 'Save case', 'cases'. Optional: some
   *  reports (a Telegram delivery gap) are about no single component. */
  component?: string | null;
  /** Which surface reported it, e.g. 'Edge Function', 'Postgres via
   *  notify-case', 'LINE webhook'. */
  origin: string;
  message: string;
  /** Fellow or staff identity, resolved server-side from the roster. Absent
   *  when the failure happened before anyone was identified. */
  who?: string | null;
  /** Route, function and call site — enough to open the right file. */
  where?: string | null;
  context?: ContextLine[];
  /** Stack or raw response, shown in a collapsed expandable quote. */
  detail?: string | null;
  fingerprint?: string | null;
  /** '1st', '2nd in 5 min', '9th in 5 min — muted until 15:41'. */
  occurrence?: string | null;
  at?: Date;
}

/** Field caps. Telegram rejects a message over 4096 characters outright, and
 *  a rejected error report is the worst kind to lose, so every variable field
 *  is bounded and the total stays comfortably inside the limit. */
export const MAX_MESSAGE = 400;
export const MAX_DETAIL = 3000;
export const MAX_BODY = 300;

/** "2 Aug 2026, 14:33 (+07)" — the clock the fellows and staff work on,
 *  regardless of where the isolate that reported it happened to run. */
export function formatWhen(at: Date): string {
  const text = at.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${text} (+07)`;
}

/** "15:41" in +07, for the "muted until" note. */
export function formatClock(at: Date): string {
  return at.toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** A labelled block, omitted entirely — label and separating blank line
 *  included — when the value is empty. Mirrors block() in caseMessage.ts. */
function block(label: string, value: string): string {
  if (!value) return '';
  return `\n\n<b>${esc(label)}</b>\n${esc(value)}`;
}

function contextBlock(lines: ContextLine[]): string {
  const rendered = lines
    .filter(line => (Array.isArray(line) ? line[1] : line))
    .map(line =>
      Array.isArray(line)
        ? `${esc(line[0])} <code>${esc(line[1])}</code>`
        : esc(line),
    );
  if (rendered.length === 0) return '';
  return `\n\n<b>Context</b>\n${rendered.join('\n')}`;
}

/** The stack goes in an expandable blockquote so it stays collapsed by
 *  default: one 40-frame trace would otherwise push the next alert off the
 *  screen, which is exactly when you most need to see it. */
function detailBlock(detail: string): string {
  if (!detail) return '';
  return `\n\n<blockquote expandable>${esc(truncate(detail, MAX_DETAIL))}</blockquote>`;
}

function footer(fingerprintValue?: string | null, occurrence?: string | null): string {
  if (!fingerprintValue && !occurrence) return '';
  const parts: string[] = [];
  if (fingerprintValue) parts.push(`<code>${esc(fingerprintValue)}</code>`);
  if (occurrence) parts.push(esc(occurrence));
  return `\n\n${parts.join(' · ')}`;
}

/** Renders one error report as Telegram HTML.
 *
 *  The headline is first because it is all a locked phone shows: severity,
 *  failure class and component, and nothing else competing for that line. */
export function errorMessage(report: ErrorReport): string {
  const at = report.at ?? new Date();
  const headline = report.component
    ? `${report.kind} · ${report.component}`
    : report.kind;

  return (
    `${EMOJI[report.severity]} <b>${esc(headline)}</b>\n` +
    `${esc(report.origin)} · ${esc(formatWhen(at))}` +
    block(MESSAGE_LABEL[report.severity], truncate(report.message, MAX_MESSAGE)) +
    block('Who', report.who ?? '') +
    block('Where', report.where ?? '') +
    contextBlock(report.context ?? []) +
    detailBlock(report.detail ?? '') +
    footer(report.fingerprint, report.occurrence)
  );
}

/** "1st", "2nd in 5 min", "9th in 5 min — muted until 15:41". Tells you at a
 *  glance whether this is new or a storm, and — when muting kicks in — that
 *  the silence about to follow is deliberate. */
export function occurrenceLine(
  occurrences: number,
  windowStartedAt: Date,
  now: Date,
  mutedUntil?: Date | null,
): string {
  const ordinal = ordinalOf(occurrences);
  const minutes = Math.max(0, Math.round((now.getTime() - windowStartedAt.getTime()) / 60000));
  const base = occurrences <= 1 || minutes < 1 ? ordinal : `${ordinal} in ${minutes} min`;
  return mutedUntil ? `${base} — muted until ${formatClock(mutedUntil)}` : base;
}

function ordinalOf(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export interface Rollup {
  fingerprint: string;
  headline: string;
  origin: string;
  message: string;
  /** Occurrences that happened while muted and were never sent. */
  suppressed: number;
  since: Date;
  lastSeen: Date;
  /** Distinct fellows/staff who hit it — one person's broken phone and an
   *  outage for everybody look identical without this. */
  peopleAffected: number;
  stillMuted: boolean;
}

/** The message that closes a mute window: what you missed, in one line, and
 *  whether it is over. */
export function rollupMessage(rollup: Rollup, now = new Date()): string {
  const people =
    rollup.peopleAffected > 0
      ? ` — ${rollup.peopleAffected} ${rollup.peopleAffected === 1 ? 'person' : 'people'} affected`
      : '';

  return errorMessage({
    severity: 'repeating',
    kind: 'Repeating',
    component: rollup.headline,
    origin: rollup.origin,
    message: rollup.message,
    context: [
      `${rollup.suppressed} more since ${formatClock(rollup.since)}${people}`,
      `Last seen ${formatClock(rollup.lastSeen)}`,
      rollup.stillMuted ? 'Muting for another hour.' : 'No longer muted.',
    ],
    fingerprint: rollup.fingerprint,
    at: now,
  });
}

/** Sent once when the hourly ceiling is reached, so a silent chat is never
 *  mistaken for a quiet hour. */
export function budgetReachedMessage(limit: number, resumesAt: Date, now = new Date()): string {
  return errorMessage({
    severity: 'muted',
    kind: 'Alert budget reached',
    origin: 'Notifier',
    message: `${limit} alerts sent in the past hour`,
    context: [
      'Further alerts are suppressed until the hour rolls over.',
      `Resumes ${formatClock(resumesAt)}`,
      'Supabase function logs still have everything.',
    ],
    at: now,
  });
}

/** The one failure that cannot be reported through the channel it is about.
 *  Emitted by the next send that succeeds, so the gap is named rather than
 *  looking like a quiet spell. */
export function deliveryGapMessage(
  lastError: string,
  headlines: string[],
  from: Date,
  to: Date,
  now = new Date(),
): string {
  const count = headlines.length;
  return errorMessage({
    severity: 'degraded',
    kind: 'Telegram delivery gap',
    origin: 'Notifier',
    message: truncate(lastError, MAX_MESSAGE),
    context: [
      `${count} message${count === 1 ? '' : 's'} lost between ` +
        `${formatClock(from)} and ${formatClock(to)}`,
      ...headlines.map(h => `· ${h}`),
      'Sending has recovered.',
    ],
    at: now,
  });
}
