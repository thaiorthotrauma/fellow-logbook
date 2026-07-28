/** Removes leading "- " bullet markers (added by the form's BulletTextarea)
 *  from each line, so text can be shown as plain prose instead of a list. */
export function stripBullets(text: string): string {
  return text.replace(/^[ \t]*-[ \t]+/gm, '').trim();
}

/** Displays a BulletTextarea field's value:
 *   - a single row      → plain text, no bullet
 *   - more than one row → each row on its own line, with its bullet retained
 *  Bullets are normalized (re-added) rather than trusted as-is, so this is
 *  consistent regardless of how the source text was formatted. Returns ''
 *  for empty input. */
export function formatBulletedField(text: string): string {
  const lines = stripBullets(text)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return lines[0] ?? '';
  return lines.map(l => `- ${l}`).join('\n');
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

// Pre-posed Thai vowels — written before the consonant they modify (e.g.
// "โพธิคุณ" = leading โ + consonant พ), so a naive first-character read
// would grab the vowel instead of the actual initial consonant.
const THAI_LEADING_VOWELS = new Set(['เ', 'แ', 'โ', 'ใ', 'ไ']);

/** Staff-view filter badge label for a fellow: first name + first letter of
 *  last name, skipping a pre-posed leading vowel so the badge shows the
 *  initial consonant (e.g. "ปองสิทธิ์ โพธิคุณ" → "ปองสิทธิ์ พ", not "... โ").
 *  Falls back to the name as-is if it doesn't split into two parts. */
export function fellowBadgeLabel(fullName: string): string {
  const [first, last] = fullName.trim().split(/\s+/);
  if (!last) return first ?? fullName;
  const initial = THAI_LEADING_VOWELS.has(last[0]) ? (last[1] ?? last[0]) : last[0];
  return `${first} ${initial}`;
}
