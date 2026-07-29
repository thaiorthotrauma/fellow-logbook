import { useEffect, useMemo, useState } from 'react';
import {
  casesMonthBounds,
  filterByMonthRange,
  monthLabel,
  monthsBetween,
  nameFileSegment,
  monthFileSegment,
  rangeLabel,
  sortChronological,
  uniqueLabels,
} from '../lib/pdf/stats';
import { clusterLabels } from '../lib/pdf/clusterLabels';
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

function pdfFileName(fellowName: string, from: string, to: string): string {
  return `TOTS-fellow-logbook_${nameFileSegment(fellowName)}_${monthFileSegment(from)}_to_${monthFileSegment(to)}.pdf`;
}

// 'shared' has no note: the native share sheet is itself the feedback that
// the PDF is ready, so an extra message here would just be redundant.
const DONE_NOTE: Record<string, string> = {
  downloaded: 'PDF downloaded.',
};

export default function ExportPdfPanel({ cases, fellowName, institution, profileLoading }: ExportPdfPanelProps) {
  const bounds = useMemo(() => casesMonthBounds(cases), [cases]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  // Cases load asynchronously, so `bounds` can still be null on first render.
  // Seed the default range once real bounds arrive, but only if the fellow
  // hasn't already picked a range themselves.
  useEffect(() => {
    if (bounds && !from && !to) {
      setFrom(bounds.min);
      setTo(bounds.max);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only seed on bounds arriving, not on every from/to edit
  }, [bounds]);

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
      // Best-effort AI grouping of synonymous diagnosis/procedure wording
      // (e.g. "ORIF" / "open reduction internal fixation") for the summary
      // page's top-5 ranking. Falls back to exact-text ranking on failure.
      const [dxClusters, procClusters] = await Promise.all([
        clusterLabels(uniqueLabels(selected, c => c.diagnosis)),
        clusterLabels(uniqueLabels(selected, c => c.procedure)),
      ]);
      // Lazy-load the PDF engine (~1 MB) only when actually exporting.
      const { generateLogbookBlob, deliverPdf } = await import('../lib/pdf/generate');
      const blob = await generateLogbookBlob({
        fellowName,
        institution,
        yearLabel: YEAR_LABEL,
        rangeLabel: rangeLabel(from, to),
        cases: selected,
        dxClusters,
        procClusters,
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
