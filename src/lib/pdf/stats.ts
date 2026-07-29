import type { CaseEntry, StaffCaseEntry } from '../../types';

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
 *  Both bounds are "YYYY-MM"; ISO dates compare correctly as strings.
 *  Generic over T so a StaffCaseEntry[] in yields a StaffCaseEntry[] out —
 *  the staff export panel needs `fellowName` to survive this filter. */
export function filterByMonthRange<T extends CaseEntry>(cases: T[], fromMonth: string, toMonth: string): T[] {
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

/** Chronological (oldest → newest) by operative date, stable on ties.
 *  Generic for the same reason as filterByMonthRange above. */
export function sortChronological<T extends CaseEntry>(cases: T[]): T[] {
  return cases
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.date < b.c.date ? -1 : a.c.date > b.c.date ? 1 : a.i - b.i))
    .map(x => x.c);
}

/** Collapse whitespace/newlines and strip leading bullet markers so free-text
 *  entries that differ only in spacing/bullets group together. Exported so
 *  the AI classification step (classifyRegion.ts) keys its answers on exactly
 *  the same normalized text the lookups in regionCategory.ts use. */
export function normalizeLabel(raw: string): { key: string; label: string } {
  const label = raw
    .replace(/^[-\s]+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { key: label.toLowerCase(), label };
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

// ── Export-panel formatting helpers ─────────────────────────────────────────
// Shared by the fellow's own export panel and the staff institution one, so
// the month-picker/filename conventions can't drift between the two.

/** "2026-07" → "July 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function rangeLabel(from: string, to: string): string {
  return from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
}

/** "2026-07" → "07-2026", for a filename's month segments. */
export function monthFileSegment(month: string): string {
  const [y, m] = month.split('-');
  return `${m}-${y}`;
}

/** A Thai full name ("ปองสิทธิ์ โพธิคุณ") → "ปองสิทธิ์-โพธิคุณ" for a filename.
 *  Falls back to the name as-is if it doesn't split into two parts. */
export function nameFileSegment(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join('-');
  return `${parts[0]}-${parts.slice(1).join('')}`;
}

/** All "YYYY-MM" months from min to max inclusive, for the dropdown options. */
export function monthsBetween(min: string, max: string): string[] {
  const out: string[] = [];
  let [y, m] = min.split('-').map(Number);
  const [ey, em] = max.split('-').map(Number);
  if (!y || !m || !ey || !em) return out;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Splits cases into one group per fellow, in first-appearance order (the
 *  cases are already chronological, so this reads as "fellows in the order
 *  their earliest case in range happened" — a stable, predictable order
 *  rather than alphabetical, which would need re-sorting fellow names that
 *  might be in Thai or English inconsistently). Used by the staff "by fellow"
 *  PDF export. */
export function groupByFellow(cases: StaffCaseEntry[]): { fellowName: string; cases: StaffCaseEntry[] }[] {
  const order: string[] = [];
  const byFellow = new Map<string, StaffCaseEntry[]>();
  for (const c of cases) {
    if (!byFellow.has(c.fellowName)) {
      byFellow.set(c.fellowName, []);
      order.push(c.fellowName);
    }
    byFellow.get(c.fellowName)!.push(c);
  }
  return order.map(fellowName => ({ fellowName, cases: byFellow.get(fellowName)! }));
}
