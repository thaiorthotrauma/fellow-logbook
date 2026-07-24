// Turns anything thrown (Error, Supabase PostgrestError, FunctionsError, or a
// bare object) into a human-readable string. Supabase's PostgrestError is a
// plain object — not an Error — so `String(err)` on it yields "[object Object]";
// this pulls out message/details/hint/code instead so failures are actionable.
/** supabase.functions.invoke collapses a failed call to a generic "Edge
 *  Function returned a non-2xx status code" message and stashes the real
 *  HTTP response on `error.context`. Read the function's JSON `{ error }` body
 *  so the actual reason (not the generic wrapper) surfaces. */
export async function functionErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      // response body wasn't JSON — fall back to the generic message
    }
  }
  return describeError(error);
}

export function describeError(err: unknown): string {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === 'string' && o.message) parts.push(o.message);
    if (typeof o.details === 'string' && o.details) parts.push(o.details);
    if (typeof o.hint === 'string' && o.hint) parts.push(`hint: ${o.hint}`);
    if (typeof o.code === 'string' && o.code) parts.push(`(${o.code})`);
    if (parts.length) return parts.join(' — ');
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return String(err);
}
