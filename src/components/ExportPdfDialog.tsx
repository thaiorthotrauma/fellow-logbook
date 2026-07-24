import { useMemo, useState } from 'react';
import { casesMonthBounds, filterByMonthRange, sortChronological } from '../lib/pdf/stats';
import { describeError } from '../lib/errors';
import type { CaseEntry } from '../types';

interface ExportPdfDialogProps {
  cases: CaseEntry[];
  fellowName: string;
  institution: string | null;
  onClose: () => void;
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

export default function ExportPdfDialog({ cases, fellowName, institution, onClose }: ExportPdfDialogProps) {
  const bounds = useMemo(() => casesMonthBounds(cases), [cases]);
  const [from, setFrom] = useState(bounds?.min ?? '');
  const [to, setTo] = useState(bounds?.max ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const inRange = useMemo(
    () => (from && to && from <= to ? filterByMonthRange(cases, from, to).length : 0),
    [cases, from, to],
  );
  const invalidRange = Boolean(from && to && from > to);
  const canGenerate = !busy && !!from && !!to && !invalidRange && inRange > 0;

  async function generate() {
    setBusy(true);
    setError('');
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
      await deliverPdf(blob, `TOTS-Logbook_${from}_to_${to}.pdf`);
      onClose();
    } catch (err) {
      console.error(err);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export-overlay" role="dialog" aria-modal="true" aria-label="Export logbook as PDF" onClick={onClose}>
      <div className="export-card" onClick={e => e.stopPropagation()}>
        <div className="export-title">Export logbook (PDF)</div>

        {bounds === null ? (
          <div className="export-note">No cases to export yet.</div>
        ) : (
          <>
            <div className="export-fields">
              <label className="export-field">
                <span>From</span>
                <input type="month" className="field-input" value={from} min={bounds.min} max={bounds.max} onChange={e => setFrom(e.target.value)} />
              </label>
              <label className="export-field">
                <span>To</span>
                <input type="month" className="field-input" value={to} min={bounds.min} max={bounds.max} onChange={e => setTo(e.target.value)} />
              </label>
            </div>

            <div className={`export-note ${invalidRange ? 'error' : ''}`}>
              {invalidRange
                ? '"From" must be on or before "To".'
                : `${inRange} ${inRange === 1 ? 'case' : 'cases'} in range · summary + chronological detail`}
            </div>

            {error && <div className="export-note error">Could not export: {error}</div>}

            <div className="export-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="button" className="btn-primary" onClick={generate} disabled={!canGenerate}>
                {busy ? 'Building PDF…' : 'Generate PDF'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
