import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { OPTIME_MAP, PLACE_MAP, PROC_MAP, ROLE_MAP, TIMING_MAP } from '../data';
import { matchScoreWordsAcrossFields } from '../lib/fuzzyMatch';
import { fellowBadgeLabel, formatBulletedField, formatClassification, stripBullets } from '../lib/textFormat';
import type { CaseEntry, StaffCaseEntry } from '../types';
import CaseImages from './CaseImages';

type LogEntry = CaseEntry | StaffCaseEntry;

function isStaffEntry(c: LogEntry): c is StaffCaseEntry {
  return 'fellowName' in c;
}

interface CaseLogProps {
  cases: LogEntry[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  /** Omitted for the read-only staff view, which shows no edit/delete actions. */
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Shown when `cases` is empty. Defaults to the fellow-facing copy, which
   *  references New Entry — not relevant for the staff view, so it supplies
   *  its own. */
  emptyMessage?: string;
}

type PlaceFilter = 'all' | 'own' | 'outside';
type SortOrder = 'newest' | 'oldest';

/** yyyy-mm-dd → "23 Jul 2026" (parsed as a local date so there's no TZ shift). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso || '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Renders a formatted field value (from formatClassification/formatBulletedField):
 *  a single line renders as plain text; multiple "- " prefixed lines render as a
 *  bulleted list where a wrapped line hangs indented under its own text. */
function BulletedText({ text }: { text: string }) {
  if (!text) return <>—</>;
  const lines = text.split('\n');
  if (lines.length <= 1) return <>{lines[0]}</>;
  return (
    <ul className="bullet-list">
      {lines.map((line, i) => (
        <li key={i}>
          <span className="bullet-mark" aria-hidden="true">-</span>
          <span className="bullet-text">{line.replace(/^- /, '')}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CaseLog({
  cases,
  expandedId,
  onToggle,
  onEdit,
  onDelete,
  emptyMessage = 'No cases logged yet. Add your first case in New Entry.',
}: CaseLogProps) {
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<PlaceFilter>('all');
  const [sort, setSort] = useState<SortOrder>('newest');
  // Staff view only: which fellows' cases to show. Empty = no filter (show
  // all) — badges start deselected rather than "all selected" so the row
  // reads as an opt-in narrowing, not a set of togglable exclusions.
  const [selectedFellows, setSelectedFellows] = useState<Set<string>>(new Set());
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  // Bring a newly-expanded card's top just below the sticky header, instead
  // of leaving it wherever it lands (potentially covered by the header, or
  // requiring a manual scroll to see what just opened).
  useLayoutEffect(() => {
    if (!expandedId) return;
    const card = cardRefs.current.get(expandedId);
    if (!card) return;
    const headerHeight = document.querySelector('.header')?.getBoundingClientRect().height ?? 0;
    const gap = 12;
    const target = window.scrollY + card.getBoundingClientRect().top - headerHeight - gap;
    window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [expandedId]);

  const fellowBadges = useMemo(() => {
    const seen = new Map<string, string>(); // fellowName -> badge label
    for (const c of cases) {
      if (isStaffEntry(c) && !seen.has(c.fellowName)) {
        seen.set(c.fellowName, fellowBadgeLabel(c.fellowName));
      }
    }
    return [...seen.entries()]
      .map(([fellowName, label]) => ({ fellowName, label }))
      .sort((a, b) => a.fellowName.localeCompare(b.fellowName, 'th-TH'));
  }, [cases]);

  function toggleFellow(fellowName: string) {
    setSelectedFellows(prev => {
      const next = new Set(prev);
      if (next.has(fellowName)) next.delete(fellowName);
      else next.add(fellowName);
      return next;
    });
  }

  const visible = useMemo(() => {
    const q = query.trim();
    const rows = cases
      .map((c, i) => ({ c, i, score: 0 })) // keep insertion order for a stable tie-break
      .filter(({ c }) => place === 'all' || c.place === place)
      .filter(({ c }) => selectedFellows.size === 0 || (isStaffEntry(c) && selectedFellows.has(c.fellowName)))
      .flatMap(row => {
        if (!q) return [row];
        // Name is filtered via the fellow badges, not the search box, so it's
        // excluded from the matched fields here. Fields are matched
        // individually rather than concatenated — see
        // matchScoreWordsAcrossFields.
        const fields = [
          row.c.diagnosis,
          row.c.otherClassification,
          row.c.approach,
          row.c.procedure,
          row.c.aoCode,
          row.c.aoRegionLabel,
        ];
        const score = matchScoreWordsAcrossFields(q, fields);
        return score === null ? [] : [{ ...row, score }];
      });
    rows.sort((a, b) => {
      // While searching, best matches lead; the newest/oldest toggle only
      // governs order once the query is empty (and all scores are 0).
      if (q && a.score !== b.score) return b.score - a.score;
      const cmp = a.c.date < b.c.date ? -1 : a.c.date > b.c.date ? 1 : a.i - b.i;
      return sort === 'newest' ? -cmp : cmp;
    });
    return rows.map(r => r.c);
  }, [cases, query, place, sort, selectedFellows]);

  const countLabel =
    visible.length === cases.length
      ? `${cases.length} ${cases.length === 1 ? 'case logged' : 'cases logged'}`
      : `${visible.length} of ${cases.length} cases`;

  return (
    <div>
      {cases.length > 0 && (
        <div className="log-controls">
          <input
            type="search"
            className="log-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search diagnosis, procedure, AO code…"
            aria-label="Search cases"
          />
          <div className="log-filters">
            <div className="seg" role="group" aria-label="Filter by institution">
              <button type="button" className={`seg-btn ${place === 'all' ? 'active' : ''}`} onClick={() => setPlace('all')}>
                All
              </button>
              <button type="button" className={`seg-btn ${place === 'own' ? 'active' : ''}`} onClick={() => setPlace('own')}>
                Home
              </button>
              <button type="button" className={`seg-btn ${place === 'outside' ? 'active' : ''}`} onClick={() => setPlace('outside')}>
                Outside
              </button>
            </div>
            <div className="seg" role="group" aria-label="Sort order">
              <button type="button" className={`seg-btn ${sort === 'newest' ? 'active' : ''}`} onClick={() => setSort('newest')}>
                Newest
              </button>
              <button type="button" className={`seg-btn ${sort === 'oldest' ? 'active' : ''}`} onClick={() => setSort('oldest')}>
                Oldest
              </button>
            </div>
          </div>
          {fellowBadges.length > 0 && (
            <div className="fellow-badges" role="group" aria-label="Filter by fellow">
              {fellowBadges.map(({ fellowName, label }) => (
                <button
                  type="button"
                  key={fellowName}
                  className={`fellow-badge ${selectedFellows.has(fellowName) ? 'active' : ''}`}
                  aria-pressed={selectedFellows.has(fellowName)}
                  title={fellowName}
                  onClick={() => toggleFellow(fellowName)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="log-count">{countLabel}</div>

      {cases.length === 0 ? (
        <div className="empty-log">{emptyMessage}</div>
      ) : visible.length === 0 ? (
        <div className="empty-log">No cases match your search or filters.</div>
      ) : (
        <div>
          {visible.map(c => {
            const expanded = expandedId === c.id;
            return (
              <div
                className={`case-card ${expanded ? 'expanded' : ''}`}
                key={c.id}
                ref={el => {
                  if (el) cardRefs.current.set(c.id, el);
                  else cardRefs.current.delete(c.id);
                }}
              >
                <button
                  type="button"
                  className="case-card-main"
                  onClick={() => onToggle(c.id)}
                  aria-expanded={expanded}
                >
                  <div className="case-card-badges">
                    <span className="case-card-date">{formatDate(c.date)}</span>
                    <span className={`case-card-place ${c.place === 'outside' ? 'outside' : ''}`}>
                      {PLACE_MAP[c.place ?? ''] ?? '—'}
                    </span>
                    <span className="case-card-timing">{TIMING_MAP[c.timing ?? ''] ?? '—'}</span>
                    <span className="case-card-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
                  </div>
                  {isStaffEntry(c) && <div className="case-card-fellow">{c.fellowName}</div>}
                  <div className="case-card-diagnosis case-card-diagnosis-truncated">{stripBullets(c.diagnosis) || '—'}</div>
                  <div className="case-card-meta">
                    <span>{ROLE_MAP[c.role ?? ''] ?? '—'}</span>
                    <span className="dot">·</span>
                    <span>{OPTIME_MAP[c.opTime ?? ''] ?? '—'}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="case-card-expanded">
                    <div className="case-detail-grid">
                      <div><span className="k">Staff</span>{c.staff || '—'}</div>
                      <div><span className="k">HN</span>{c.hn || '—'}</div>
                      <div><span className="k">Place</span>{PLACE_MAP[c.place ?? ''] ?? '—'}</div>
                      <div><span className="k">Hours</span>{TIMING_MAP[c.timing ?? ''] ?? '—'}</div>
                      <div>
                        <span className="k">Diagnosis</span>
                        <BulletedText text={formatBulletedField(c.diagnosis)} />
                      </div>
                      <div>
                        <span className="k">Classification</span>
                        <BulletedText text={formatClassification(c.aoCode, c.otherClassification)} />
                      </div>
                      <div>
                        <span className="k">Approach</span>
                        <BulletedText text={formatBulletedField(c.approach)} />
                      </div>
                      {c.position && <div><span className="k">Position</span>{c.position}</div>}
                      <div><span className="k">Type of procedure</span>{PROC_MAP[c.procedureType ?? ''] ?? '—'}</div>
                      <div>
                        <span className="k">Procedure(s)</span>
                        <BulletedText text={formatBulletedField(c.procedure)} />
                      </div>
                      {c.memo && (
                        <div>
                          <span className="k">Memo</span>
                          <BulletedText text={formatBulletedField(c.memo)} />
                        </div>
                      )}
                    </div>
                    {c.imagePaths.length > 0 && <CaseImages paths={c.imagePaths} />}
                    {onEdit && onDelete && (
                      <div className="case-card-actions">
                        <button
                          type="button"
                          className="case-card-edit"
                          onClick={e => { e.stopPropagation(); onEdit(c.id); }}
                        >
                          Edit case
                        </button>
                        <button
                          type="button"
                          className="case-card-delete"
                          onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                        >
                          Delete case
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
