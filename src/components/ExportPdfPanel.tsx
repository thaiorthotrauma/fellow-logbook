import { useMemo, useState } from 'react';
import { casesMonthBounds, filterByMonthRange, sortChronological } from '../lib/pdf/stats';
import { describeError } from '../lib/errors';
import type { CaseEntry } from '../types';

interface ExportPdfPanelProps {
  cases: CaseEntry[];
  fellowName: string;
  institution: string | null;
  /** True until the fellow's profile (name, institution) has finished
   *  loading — generation is blocked until then, otherwise a PDF started
   *  right after switching tabs could bake in a blank name/institution. */
  profileLoading: boolean;
}

const YEAR_LABEL = '2026–2027';

/** "2026-07" → "July 2026". */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function rangeLabel(from: string, to: string): string {
  return from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
}

/** "2026-07" → "07-2026", for the filename's month segments. */
function monthFileSegment(month: string): string {
  const [y, m] = month.split('-');
  return `${m}-${y}`;
}

/** Fellow's Thai full name ("ปองสิทธิ์ โพธิคุณ") → "ปองสิทธิ์-โพธิคุณ" for the
 *  filename. Falls back to the name as-is if it doesn't split into two parts. */
function nameFileSegment(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts.join('-');
  return `${parts[0]}-${parts.slice(1).join('')}`;
}

function pdfFileName(fellowName: string, from: string, to: string): string {
  return `TOTS-fellow-logbook_${nameFileSegment(fellowName)}_${monthFileSegment(from)}_to_${monthFileSegment(to)}.pdf`;
}

/** All "YYYY-MM" months from min to max inclusive, for the dropdown options. */
function monthsBetween(min: string, max: string): string[] {
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

// 'shared' has no note: the native share sheet is itself the feedback that
// the PDF is ready, so an extra message here would just be redundant.
const DONE_NOTE: Record<string, string> = {
  opened: 'PDF opened in your browser — save it from there.',
  downloaded: 'PDF downloaded.',
};

export default function ExportPdfPanel({ cases, fellowName, institution, profileLoading }: ExportPdfPanelProps) {
  const bounds = useMemo(() => casesMonthBounds(cases), [cases]);
  const [from, setFrom] = useState(bounds?.min ?? '');
  const [to, setTo] = useState(bounds?.max ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const monthOptions = useMemo(() => (bounds ? monthsBetween(bounds.min, bounds.max) : []), [bounds]);
  const inRange = useMemo(
    () => (from && to && from <= to ? filterByMonthRange(cases, from, to).length : 0),
    [cases, from, to],
  );
  const invalidRange = Boolean(from && to && from > to);
  const canGenerate = !busy && !profileLoading && !!from && !!to && !invalidRange && inRange > 0;

  async function generate() {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const selected = sortChronological(filterByMonthRange(cases, from, to));
      // Lazy-load the PDF engine (~1 MB) only when actually exporting.
      const { generateLogbookBlob, deliverPdf } = await import('../lib/pdf/generate');
      const blob = await generateLogbookBlob({
        fellowName,
        institution,
        yearLabel: YEAR_LABEL,
        rangeLabel: rangeLabel(from, to),
        cases: selected,
      });
      const result = await deliverPdf(blob, pdfFileName(fellowName, from, to));
      setDone(DONE_NOTE[result] ?? '');
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="step-title">Export logbook (PDF)</span>
      </div>

      {bounds === null ? (
        <div className="field-label">No cases to export yet. Add cases in New Entry first.</div>
      ) : (
        <>
          <div className="field-label" style={{ marginBottom: 14 }}>
            Choose the month range to include. The PDF opens with a summary page (case count, top diagnoses &amp;
            procedures, and charts), followed by each case in date order, oldest first.
          </div>

          <div className="export-fields">
            <label className="export-field">
              <span>From</span>
              <select className="field-select" value={from} onChange={e => { setFrom(e.target.value); setDone(''); }}>
                {monthOptions.map(mo => (
                  <option key={mo} value={mo}>{monthLabel(mo)}</option>
                ))}
              </select>
            </label>
            <label className="export-field">
              <span>To</span>
              <select className="field-select" value={to} onChange={e => { setTo(e.target.value); setDone(''); }}>
                {monthOptions.map(mo => (
                  <option key={mo} value={mo}>{monthLabel(mo)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className={`export-note ${invalidRange ? 'error' : ''}`}>
            {invalidRange
              ? '"From" must be on or before "To".'
              : `${inRange} ${inRange === 1 ? 'case' : 'cases'} in range`}
          </div>

          {error && <div className="export-note error">Could not export: {error}</div>}
          {done && <div className="export-note success">{done}</div>}

          <div className="export-actions">
            <button type="button" className="btn-primary" onClick={generate} disabled={!canGenerate}>
              {busy ? 'Building PDF…' : profileLoading ? 'Loading profile…' : 'Generate PDF'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
