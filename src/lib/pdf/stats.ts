import type { CaseEntry } from '../../types';

// Pure aggregation helpers for the PDF export. No react-pdf / DOM imports so the
// ranking + distribution logic stays unit-testable in isolation.

export interface RankItem {
  label: string;
  count: number;
}

export interface Slice {
  label: string;
  value: number;
}

/** The "YYYY-MM" month of a case's operative date. */
export function caseMonth(c: CaseEntry): string {
  return (c.date ?? '').slice(0, 7);
}

/** Cases whose operative month falls within [fromMonth, toMonth] inclusive.
 *  Both bounds are "YYYY-MM"; ISO dates compare correctly as strings. */
export function filterByMonthRange(cases: CaseEntry[], fromMonth: string, toMonth: string): CaseEntry[] {
  return cases.filter(c => {
    const m = caseMonth(c);
    return m !== '' && m >= fromMonth && m <= toMonth;
  });
}

/** The earliest/latest operative months present, for defaulting the picker.
 *  Null when there are no dated cases. */
export function casesMonthBounds(cases: CaseEntry[]): { min: string; max: string } | null {
  const months = cases.map(caseMonth).filter(Boolean).sort();
  if (months.length === 0) return null;
  return { min: months[0], max: months[months.length - 1] };
}

/** Chronological (oldest → newest) by operative date, stable on ties. */
export function sortChronological(cases: CaseEntry[]): CaseEntry[] {
  return cases
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.date < b.c.date ? -1 : a.c.date > b.c.date ? 1 : a.i - b.i))
    .map(x => x.c);
}

/** Collapse whitespace/newlines and strip leading bullet markers so free-text
 *  entries that differ only in spacing/bullets rank together. */
function normalize(raw: string): { key: string; label: string } {
  const label = raw
    .replace(/^[-\s]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { key: label.toLowerCase(), label };
}

/** Top `n` most frequent values of a free-text field, by normalized text.
 *  Ties break alphabetically for a deterministic order. Empty values ignored. */
export function topN(cases: CaseEntry[], pick: (c: CaseEntry) => string, n: number): RankItem[] {
  const map = new Map<string, RankItem>();
  for (const c of cases) {
    const raw = pick(c);
    if (!raw || !raw.trim()) continue;
    const { key, label } = normalize(raw);
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { label, count: 1 });
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, n);
}

/** Category counts for a pie chart, in the canonical option order, omitting
 *  categories with no cases. */
export function distribution(
  cases: CaseEntry[],
  pick: (c: CaseEntry) => string | null,
  order: readonly { value: string; label: string }[],
): Slice[] {
  const counts = new Map<string, number>();
  for (const c of cases) {
    const v = pick(c);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return order
    .filter(o => counts.has(o.value))
    .map(o => ({ label: o.label, value: counts.get(o.value) as number }));
}
