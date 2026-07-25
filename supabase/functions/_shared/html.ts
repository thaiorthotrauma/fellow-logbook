/** Escapes text for Telegram's HTML parse mode. Must be applied to every
 *  interpolated value — a diagnosis containing "<" or "&" would otherwise be
 *  rejected by the API as malformed entities, silently losing the message.
 *
 *  Kept in its own module (rather than beside the sender) so the message
 *  builders stay free of any Deno runtime dependency and can be unit-tested
 *  from the app's own test suite. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
