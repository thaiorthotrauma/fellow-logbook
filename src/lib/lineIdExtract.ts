/** Pulls a LINE user id out of the "message from unregistered user" text
 *  line-webhook forwards to Telegram (see _shared/caseMessage.ts's
 *  chatMessage), so an admin can paste the whole forwarded message instead
 *  of hunting for the id inside it.
 *
 *  Tries the labelled "LINE user ID" line first, then falls back to the bare
 *  "U" + 32 hex chars shape LINE user ids always have, in case forwarding
 *  stripped the surrounding text and left only the id itself. */
export function extractLineUserId(text: string): string | null {
  const labeled = /LINE user ID\s*\n+\s*([A-Za-z0-9_-]{16,64})/i.exec(text);
  if (labeled) return labeled[1];
  const bare = /\bU[0-9a-f]{32}\b/i.exec(text);
  return bare ? bare[0] : null;
}
