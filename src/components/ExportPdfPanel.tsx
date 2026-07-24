import { useMemo, useState } from 'react';
import { casesMonthBounds, filterByMonthRange, sortChronological } from '../lib/pdf/stats';
import { describeError } from '../lib/errors';
import type { CaseEntry } from '../types';

interface ExportPdfPanelProps {
  cases: CaseEntry[];
  fellowName: string;
  institution: string | null;
}

const YEAR_LABEL = '2026–2027';

/** "2026-07" → "Jul 2026". */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function rangeLabel(from: string, to: string): string {
  return from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
}

const DONE_NOTE: Record<string, string> = {
  shared: 'PDF ready — choose where to save or send it.',
  opened: 'PDF opened in your browser — save it from there.',
  downloaded: 'PDF downloaded.',
};

export default function ExportPdfPanel({ cases, fellowName, institution }: ExportPdfPanelProps) {
  const bounds = useMemo(() => casesMonthBounds(cases), [cases]);
  const [from, setFrom] = useState(bounds?.min ?? '');
  const [to, setTo] = useState(bounds?.max ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const inRange = useMemo(
    () => (from && to && from <= to ? filterByMonthRange(cases, from, to).length : 0),
    [cases, from, to],
  );
  const invalidRange = Boolean(from && to && from > to);
  const canGenerate = !busy && !!from && !!to && !invalidRange && inRange > 0;

  async function generate() {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const selected = sortChronological(filterByMonthRange(cases, from, to));
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      // Lazy-load the PDF engine (~1 MB) only when actually exporting.
      const { generateLogbookBlob, deliverPdf } = await import('../lib/pdf/generate');
      const blob = await generateLogbookBlob({
        fellowName,
        institution,
        yearLabel: YEAR_LABEL,
        rangeLabel: rangeLabel(from, to),
        generatedLabel: `Generated ${today}`,
        cases: selected,
      });
      const result = await deliverPdf(blob, `TOTS-Logbook_${from}_to_${to}.pdf`);
      setDone(DONE_NOTE[result] ?? 'PDF ready.');
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
              <input type="month" className="field-input" value={from} min={bounds.min} max={bounds.max} onChange={e => { setFrom(e.target.value); setDone(''); }} />
            </label>
            <label className="export-field">
              <span>To</span>
              <input type="month" className="field-input" value={to} min={bounds.min} max={bounds.max} onChange={e => { setTo(e.target.value); setDone(''); }} />
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
              {busy ? 'Building PDF…' : 'Generate PDF'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
