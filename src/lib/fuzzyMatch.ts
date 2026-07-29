const WORD_START = /[^a-zA-Zก-๙0-9]/;

/** Character-subsequence fuzzy match (fzf / VS Code "Go to File" style):
 *  every character of `query` must appear in `target`, in order, but not
 *  necessarily contiguously. Returns `null` when no such match exists,
 *  otherwise a score where higher means a better match — consecutive runs
 *  and word-boundary starts score higher, and matches packed tightly
 *  together beat ones scattered across `target`. */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 0;

  let score = 0;
  let searchFrom = 0;
  let firstMatch = -1;
  let prevMatch = -1;

  for (const ch of q) {
    const found = t.indexOf(ch, searchFrom);
    if (found === -1) return null;
    if (firstMatch === -1) firstMatch = found;

    if (found === prevMatch + 1) score += 5;
    else if (found === 0 || WORD_START.test(t[found - 1])) score += 3;
    else score += 1;

    prevMatch = found;
    searchFrom = found + 1;
  }

  const span = prevMatch - firstMatch + 1;
  score += Math.max(0, 10 - (span - q.length));
  return score;
}

/** Multi-word, multi-field fuzzy match: every whitespace-separated word in
 *  `query` must fuzzy-match *within a single field* of `fields` (a word can't
 *  be satisfied by stitching characters across different fields — only
 *  `fuzzyScore`'s within-field scattering is allowed). Different words may
 *  still match different fields. This is what keeps a query like "pelvis"
 *  from matching a distal-radius case just because its diagnosis, approach,
 *  procedure, AO code, etc. happen to contain p/e/l/v/i/s in order somewhere
 *  across that combination of unrelated fields. Score is the sum of each
 *  word's best per-field `fuzzyScore`; returns `null` if any word fails to
 *  match every field. */
export function fuzzyScoreWordsAcrossFields(query: string, fields: string[]): number | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let total = 0;
  for (const word of words) {
    let best: number | null = null;
    for (const field of fields) {
      if (!field) continue;
      const s = fuzzyScore(word, field);
      if (s !== null && (best === null || s > best)) best = s;
    }
    if (best === null) return null;
    total += best;
  }
  return total;
}
