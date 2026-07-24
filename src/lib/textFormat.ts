/** Removes leading "- " bullet markers (added by the form's BulletTextarea)
 *  from each line, so text can be shown as plain prose instead of a list. */
export function stripBullets(text: string): string {
  return text.replace(/^[ \t]*-[ \t]+/gm, '').trim();
}

/** Combines Q6 (AO classification code) and Q7 (Other classification) into
 *  one display value:
 *   - only Q6 answered  → "AO/OTA <code>", no bullet
 *   - only Q7 answered  → its text, bullet markers stripped
 *   - both answered     → a bulleted list: the AO/OTA line first, then Q7's
 *     lines (bullets normalized, so it's consistent regardless of how the
 *     source text was formatted)
 *  Returns '' when neither is answered. */
export function formatClassification(aoCode: string, other: string): string {
  const ao = aoCode.trim();
  const otherLines = stripBullets(other)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (ao && otherLines.length === 0) return `AO/OTA ${ao}`;
  if (!ao && otherLines.length > 0) return otherLines.join('\n');
  if (ao && otherLines.length > 0) {
    return [`- AO/OTA ${ao}`, ...otherLines.map(l => `- ${l}`)].join('\n');
  }
  return '';
}
