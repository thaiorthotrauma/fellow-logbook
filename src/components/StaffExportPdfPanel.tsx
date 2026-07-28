import { useEffect, useMemo, useState } from 'react';
import {
  casesMonthBounds,
  filterByMonthRange,
  groupByFellow,
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
import type { StaffCaseEntry } from '../types';

interface StaffExportPdfPanelProps {
  cases: StaffCaseEntry[];
  institution: string;
  /** True until the staff profile has finished loading — mirrors
   *  ExportPdfPanel's profileLoading guard, same reason: generation started
   *  right after switching tabs could otherwise bake in a blank institution. */
  profileLoading: boolean;
}

const YEAR_LABEL = '2026–2027';

type Grouping = 'month' | 'fellow' | 'single';

function pdfFileName(institution: string, grouping: Grouping, from: string, to: string, fellowName: string): string {
  const suffix =
    grouping === 'fellow' ? 'by-fellow' : grouping === 'single' ? nameFileSegment(fellowName) : monthFileSegment(to);
  return `TOTS-staff-logbook_${nameFileSegment(institution)}_${monthFileSegment(from)}_to_${suffix}.pdf`;
}

// 'shared' has no note: the native share sheet is itself the feedback that
// the PDF is ready, so an extra message here would just be redundant.
const DONE_NOTE: Record<string, string> = {
  opened: 'PDF opened in your browser — save it from there.',
  downloaded: 'PDF downloaded.',
};

export default function StaffExportPdfPanel({ cases, institution, profileLoading }: StaffExportPdfPanelProps) {
  const bounds = useMemo(() => casesMonthBounds(cases), [cases]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [grouping, setGrouping] = useState<Grouping>('month');
  const [selectedFellow, setSelectedFellow] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  // Cases load asynchronously, so `bounds` can still be null on first render.
  // Seed the default range once real bounds arrive, but only if staff hasn't
  // already picked a range themselves.
  useEffect(() => {
    if (bounds && !from && !to) {
      setFrom(bounds.min);
      setTo(bounds.max);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only seed on bounds arriving, not on every from/to edit
  }, [bounds]);

  const monthOptions = useMemo(() => (bounds ? monthsBetween(bounds.min, bounds.max) : []), [bounds]);
  const selected = useMemo(
    () => (from && to && from <= to ? sortChronological(filterByMonthRange(cases, from, to)) : []),
    [cases, from, to],
  );
  const invalidRange = Boolean(from && to && from > to);

  // Only fellows with at least one case in the current range are offered —
  // picking one guaranteed to have data, rather than an empty export.
  const fellowOptions = useMemo(
    () => [...new Set(selected.map(c => c.fellowName))].sort((a, b) => a.localeCompare(b, 'th-TH')),
    [selected],
  );
  const fellowCases = useMemo(
    () => (grouping === 'single' ? selected.filter(c => c.fellowName === selectedFellow) : selected),
    [selected, grouping, selectedFellow],
  );

  // Clears a stale pick if the date range changes underneath it and that
  // fellow no longer has cases in range, rather than leaving a selection
  // the <select> can't actually render as chosen.
  useEffect(() => {
    if (selectedFellow && !fellowOptions.includes(selectedFellow)) setSelectedFellow('');
  }, [fellowOptions, selectedFellow]);

  const canGenerate =
    !busy &&
    !profileLoading &&
    !!from &&
    !!to &&
    !invalidRange &&
    (grouping === 'single' ? !!selectedFellow && fellowCases.length > 0 : selected.length > 0);

  async function generate() {
    setBusy(true);
    setError('');
    setDone('');
    try {
      // Best-effort AI grouping of synonymous diagnosis/procedure wording
      // (e.g. "ORIF" / "open reduction internal fixation") for the summary
      // page's top-5 ranking — one merged map shared across every fellow's
      // summary, however the export is grouped. Falls back to exact-text
      // ranking on failure. Scoped to fellowCases so a single-fellow export
      // only clusters that fellow's own wording, not the whole institution's.
      const [dxClusters, procClusters] = await Promise.all([
        clusterLabels(uniqueLabels(fellowCases, c => c.diagnosis)),
        clusterLabels(uniqueLabels(fellowCases, c => c.procedure)),
      ]);
      // Lazy-load the PDF engine (~1 MB) only when actually exporting.
      const { generateLogbookBlob, generateStaffLogbookBlob, deliverPdf } = await import('../lib/pdf/generate');

      const blob =
        grouping === 'month'
          ? await generateLogbookBlob({
              fellowName: institution,
              institution: null,
              yearLabel: YEAR_LABEL,
              rangeLabel: rangeLabel(from, to),
              cases: selected,
              dxClusters,
              procClusters,
            })
          : grouping === 'single'
            ? await generateLogbookBlob({
                fellowName: selectedFellow,
                institution,
                yearLabel: YEAR_LABEL,
                rangeLabel: rangeLabel(from, to),
                cases: fellowCases,
                dxClusters,
                procClusters,
              })
            : await generateStaffLogbookBlob({
                institution,
                yearLabel: YEAR_LABEL,
                rangeLabel: rangeLabel(from, to),
                fellows: groupByFellow(selected),
                dxClusters,
                procClusters,
              });

      const result = await deliverPdf(blob, pdfFileName(institution, grouping, from, to, selectedFellow));
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
        <span className="step-title">Export institution logbook (PDF)</span>
      </div>

      {bounds === null ? (
        <div className="field-label">No cases to export yet.</div>
      ) : (
        <>
          <div className="field-label" style={{ marginBottom: 14 }}>
            Choose the month range and how to group the cases.
          </div>

          <div className="seg" role="group" aria-label="Group by" style={{ marginBottom: 14 }}>
            <button type="button" className={`seg-btn ${grouping === 'month' ? 'active' : ''}`} onClick={() => { setGrouping('month'); setDone(''); }}>
              By month range
            </button>
            <button type="button" className={`seg-btn ${grouping === 'fellow' ? 'active' : ''}`} onClick={() => { setGrouping('fellow'); setDone(''); }}>
              By fellow
            </button>
            <button type="button" className={`seg-btn ${grouping === 'single' ? 'active' : ''}`} onClick={() => { setGrouping('single'); setDone(''); }}>
              Single fellow
            </button>
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

          {grouping === 'single' && (
            <label className="export-field" style={{ marginBottom: 14 }}>
              <span>Fellow</span>
              <select
                className="field-select"
                value={selectedFellow}
                onChange={e => { setSelectedFellow(e.target.value); setDone(''); }}
              >
                <option value="" disabled>
                  {fellowOptions.length === 0 ? 'No fellows have cases in this range' : 'Select fellow…'}
                </option>
                {fellowOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          )}

          <div className={`export-note ${invalidRange ? 'error' : ''}`}>
            {invalidRange
              ? '"From" must be on or before "To".'
              : `${fellowCases.length} ${fellowCases.length === 1 ? 'case' : 'cases'} in range`}
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

