import { useMemo, useState } from 'react';
import { OPTIME_MAP, PLACE_MAP, PROC_MAP, ROLE_MAP, TIMING_MAP } from '../data';
import type { CaseEntry } from '../types';
import CaseImages from './CaseImages';

interface CaseLogProps {
  cases: CaseEntry[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
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

export default function CaseLog({ cases, expandedId, onToggle, onDelete }: CaseLogProps) {
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<PlaceFilter>('all');
  const [sort, setSort] = useState<SortOrder>('newest');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = cases
      .map((c, i) => ({ c, i })) // keep insertion order for a stable tie-break
      .filter(({ c }) => {
        if (place !== 'all' && c.place !== place) return false;
        if (!q) return true;
        return [c.diagnosis, c.otherClassification, c.approach, c.procedure, c.aoCode, c.aoRegionLabel]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
    rows.sort((a, b) => {
      const cmp = a.c.date < b.c.date ? -1 : a.c.date > b.c.date ? 1 : a.i - b.i;
      return sort === 'newest' ? -cmp : cmp;
    });
    return rows.map(r => r.c);
  }, [cases, query, place, sort]);

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
        </div>
      )}

      <div className="log-count">{countLabel}</div>

      {cases.length === 0 ? (
        <div className="empty-log">No cases logged yet. Add your first case in New Entry.</div>
      ) : visible.length === 0 ? (
        <div className="empty-log">No cases match your search or filters.</div>
      ) : (
        <div>
          {visible.map(c => {
            const expanded = expandedId === c.id;
            return (
              <div className={`case-card ${expanded ? 'expanded' : ''}`} key={c.id}>
                <button
                  type="button"
                  className="case-card-main"
                  onClick={() => onToggle(c.id)}
                  aria-expanded={expanded}
                >
                  <div className="case-card-badges">
                    <span className="case-card-date">{formatDate(c.date)}</span>
                    <span className="case-card-timing">{TIMING_MAP[c.timing ?? ''] ?? '—'}</span>
                    <span className={`case-card-place ${c.place === 'outside' ? 'outside' : ''}`}>
                      {PLACE_MAP[c.place ?? ''] ?? '—'}
                    </span>
                    {c.aoCode && <span className="case-card-aocode">{c.aoCode}</span>}
                    <span className="case-card-chevron" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
                  </div>
                  <div className="case-card-diagnosis">{c.diagnosis || '—'}</div>
                  <div className="case-card-meta">
                    <span>{ROLE_MAP[c.role ?? ''] ?? '—'}</span>
                    <span className="dot">·</span>
                    <span>{OPTIME_MAP[c.opTime ?? ''] ?? '—'}</span>
                    {c.imagePaths.length > 0 && (
                      <span className="case-card-imgcount">
                        {c.imagePaths.length} image{c.imagePaths.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </button>

                {expanded && (
                  <div className="case-card-expanded">
                    <div className="case-detail-grid">
                      <div><span className="k">Staff</span>{c.staff || '—'}</div>
                      <div><span className="k">HN</span>{c.hn || '—'}</div>
                      <div><span className="k">Other classification</span>{c.otherClassification || '—'}</div>
                      <div><span className="k">Approach</span>{c.approach || '—'}</div>
                      {c.position && <div><span className="k">Position</span>{c.position}</div>}
                      <div><span className="k">Type of procedure</span>{PROC_MAP[c.procedureType ?? ''] ?? '—'}</div>
                      <div className="full"><span className="k">Procedure(s)</span>{c.procedure || '—'}</div>
                      {c.memo && <div className="full"><span className="k">Memo</span>{c.memo}</div>}
                    </div>
                    {c.imagePaths.length > 0 && <CaseImages paths={c.imagePaths} />}
                    <div className="case-card-actions">
                      <button
                        type="button"
                        className="case-card-delete"
                        onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                      >
                        Delete case
                      </button>
                    </div>
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
