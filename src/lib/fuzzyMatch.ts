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

/** Multi-word fuzzy match: every whitespace-separated word in `query` must
 *  fuzzy-match somewhere in `target` (AND across words, any order) — so
 *  "distal radius" only matches text containing both. Score is the sum of
 *  each word's `fuzzyScore`; returns `null` if any word fails to match. */
export function fuzzyScoreWords(query: string, target: string): number | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  let total = 0;
  for (const word of words) {
    const s = fuzzyScore(word, target);
    if (s === null) return null;
    total += s;
  }
  return total;
}
