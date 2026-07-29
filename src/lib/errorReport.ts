// Reports a browser-side failure to the admin Telegram chat, via the
// log-error Edge Function.
//
// Until now every failure in the app ended at console.error — a console
// nobody reads, on a phone, inside LINE's in-app browser, where there are no
// devtools to open. This is the other end of that: the same call sites now
// say what broke somewhere it will actually be seen.
//
// Best-effort by construction. Every entry point swallows its own failures, so
// a reporting problem can never become a second, louder problem on top of the
// one being reported.

import { supabase } from './supabaseClient';
import { liff } from './liff';

const LOG_FN = 'log-error';

/** How long one fingerprint stays quiet after being reported from this page.
 *  The server has its own flood control, but a render loop or a retrying
 *  upload can fire hundreds of times a second, and those requests should
 *  never leave the device in the first place. */
const LOCAL_COOLDOWN_MS = 60_000;

/** A hard stop for one page load, in case the cooldown key varies (a message
 *  with a changing id in it) and the map fills with near-duplicates. */
const MAX_REPORTS_PER_PAGE = 20;

const lastSeen = new Map<string, number>();
let reportsSent = 0;
let installed = false;

/** The commit this bundle was built from. A stale cached bundle inside the
 *  LINE in-app browser is a real failure mode here, and it looks exactly like
 *  a bug that was already fixed — so the build is on every report. */
const BUILD = (import.meta.env.VITE_BUILD_SHA as string | undefined) ?? 'dev';

export interface ReportOptions {
  /** What the person was doing, in the app's own words: 'Save case',
   *  'Export PDF'. Shown in the headline, so keep it short. */
  component: string;
  /** Call site, e.g. 'saveCase → drive-images (upload)'. */
  where?: string;
  /** Extra lines: sizes, counts, ids. Never patient data. */
  context?: string[];
  /** 'degraded' when a fallback absorbed it and the person saw nothing
   *  wrong. Defaults to 'error'. */
  severity?: 'error' | 'degraded';
}

/** Describes a thrown value WITHOUT Postgres `details`.
 *
 *  src/lib/errors.ts deliberately includes `details` — on screen it's what
 *  makes a failure actionable. In a Telegram message it is the opposite: on a
 *  constraint or RLS failure PostgREST fills it with "Failing row contains
 *  (...)", the whole row, HN and diagnosis included. The server scrubs that
 *  pattern too, but the value should never be put on the wire to begin with. */
function describeForReport(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === 'string' && o.message) parts.push(o.message);
    if (typeof o.hint === 'string' && o.hint) parts.push(`hint: ${o.hint}`);
    if (typeof o.code === 'string' && o.code) parts.push(`(${o.code})`);
    if (parts.length) return parts.join(' — ');
  }
  return String(err);
}

/** Which phone, which LINE, and whether this is LIFF or a real browser. The
 *  PDF export bugs in this repo were every one of them context-specific, so
 *  this line is usually the first thing worth reading. */
function deviceLine(): string {
  const parts: string[] = [];
  try {
    const os = liff.getOS();
    if (os) parts.push(os);
    const version = liff.getLineVersion();
    if (version) parts.push(`LINE ${version}`);
    parts.push(liff.isInClient() ? 'LIFF' : 'external browser');
  } catch {
    // LIFF not initialised yet — which is itself worth knowing.
    parts.push('LIFF not initialised');
  }
  return parts.join(' · ');
}

/** True the first time a key is seen, or once the cooldown has elapsed. */
function shouldSend(key: string): boolean {
  if (reportsSent >= MAX_REPORTS_PER_PAGE) return false;
  const now = Date.now();
  const previous = lastSeen.get(key);
  if (previous !== undefined && now - previous < LOCAL_COOLDOWN_MS) return false;
  lastSeen.set(key, now);
  reportsSent += 1;
  return true;
}

/** Sends one failure to the admin chat. Never throws, never rejects, and is
 *  never worth awaiting — call it and carry on handling the error. */
export function reportError(err: unknown, options: ReportOptions): void {
  try {
    const message = describeForReport(err);
    if (!shouldSend(`${options.component}|${options.where ?? ''}|${message}`)) return;

    const context = [...(options.context ?? []), deviceLine(), `Build ${BUILD}`];

    void supabase.functions
      .invoke(LOG_FN, {
        body: {
          severity: options.severity ?? 'error',
          component: options.component,
          message,
          where: options.where,
          context,
          detail: err instanceof Error ? err.stack : undefined,
        },
      })
      .catch(() => {
        // Reporting an error must never produce one. The console line at the
        // call site is still there.
      });
  } catch {
    // Same reasoning: nothing this function does is worth an exception.
  }
}

/** A failure a fallback absorbed. Nobody reports these, because nothing
 *  visibly broke — which is exactly why they need their own tier. */
export function reportDegraded(err: unknown, options: Omit<ReportOptions, 'severity'>): void {
  reportError(err, { ...options, severity: 'degraded' });
}

/** Catches what no `catch` block did: a render that threw, a promise nobody
 *  awaited. Installed once, from main.tsx, before the app mounts. */
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', event => {
    // Resource load failures (a missing font, a blocked script) fire here too
    // with no Error attached; they aren't app bugs and would only be noise.
    if (!event.error) return;
    reportError(event.error, {
      component: 'Uncaught',
      where: event.filename
        ? `${event.filename}:${event.lineno}:${event.colno}`
        : undefined,
    });
  });

  window.addEventListener('unhandledrejection', event => {
    reportError(event.reason, { component: 'Unhandled rejection' });
  });
}

/** Test seam: page-level dedupe state is module-global by design. */
export function resetReportStateForTests(): void {
  lastSeen.clear();
  reportsSent = 0;
  installed = false;
}
