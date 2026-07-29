const WORD_BREAK = /[^a-zA-Zก-๙0-9]/;

function isWordStart(target: string, i: number): boolean {
  return i === 0 || WORD_BREAK.test(target[i - 1]);
}

/** First letter of each word: "Open reduction internal fixation" → "orif". */
function initials(target: string): string {
  return target
    .split(WORD_BREAK)
    .filter(Boolean)
    .map(w => w[0])
    .join('');
}

/** Scores one query word against one field. A word must appear as an actual
 *  substring (case-insensitive), or as an acronym of the field's words —
 *  deliberately NOT as a scattered character subsequence. Subsequence
 *  matching (fzf-style) is far too loose for clinical free text: "radius"
 *  matches "closed f[r][a]cture ... [d]elto[i]d ... inj[u]ry ... un[s]table"
 *  purely by accident, which made searches return unrelated regions.
 *  Returns `null` for no match, otherwise a score where higher is better —
 *  whole-word hits beat word-start hits, which beat mid-word hits, which
 *  beat acronym hits. */
export function matchScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;

  const at = t.indexOf(q);
  if (at !== -1) {
    const endsWord = at + q.length === t.length || WORD_BREAK.test(t[at + q.length]);
    let score = 100;
    if (isWordStart(t, at)) score += 50;
    if (endsWord) score += 20;
    return score;
  }

  // "orif" → "Open reduction internal fixation". A single-letter query can't
  // reach here: every initial is itself a character of `t`, so the substring
  // branch above would already have matched it.
  if (initials(t).includes(q)) return 40;

  return null;
}

/** Multi-word, multi-field match: every whitespace-separated word in `query`
 *  must match at least one field of `fields` (AND across words, any order),
 *  and each word must match a single field on its own — a word is never
 *  satisfied by stitching pieces of different fields together. Different
 *  words may still match different fields, so "volar radius" matches a case
 *  whose approach is "Volar" and whose region is "Forearm (Radius / Ulna)".
 *  Score is the sum of each word's best per-field `matchScore`; returns
 *  `null` if any word matches nothing. */
export function matchScoreWordsAcrossFields(query: string, fields: string[]): number | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let total = 0;
  for (const word of words) {
    let best: number | null = null;
    for (const field of fields) {
      if (!field) continue;
      const s = matchScore(word, field);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best === null) return null;
    total += best;
  }
  return total;
}
