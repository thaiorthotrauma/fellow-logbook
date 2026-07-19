import { OPTIME_MAP, PLACE_MAP, PROC_MAP, ROLE_MAP, TIMING_MAP } from '../data';
import type { CaseEntry } from '../types';

interface CaseLogProps {
  cases: CaseEntry[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function CaseLog({ cases, expandedId, onToggle, onDelete }: CaseLogProps) {
  const casesView = [...cases].reverse();

  return (
    <div>
      <div className="log-count">
        {cases.length} {cases.length === 1 ? 'case logged' : 'cases logged'}
      </div>

      {cases.length > 0 ? (
        <div>
          {casesView.map(c => {
            const expanded = expandedId === c.id;
            return (
              <div className="case-card" key={c.id}>
                <div className="case-card-top">
                  <button type="button" className="case-card-main" onClick={() => onToggle(c.id)}>
                    <div className="case-card-badges">
                      <span className="case-card-date">{c.date}</span>
                      <span className="case-card-timing">{TIMING_MAP[c.timing ?? ''] ?? '—'}</span>
                      {c.aoCode && <span className="case-card-aocode">{c.aoCode}</span>}
                    </div>
                    <div className="case-card-diagnosis">{c.diagnosis || '—'}</div>
                    <div className="case-card-meta">
                      {ROLE_MAP[c.role ?? ''] ?? '—'} · {OPTIME_MAP[c.opTime ?? ''] ?? '—'} · {PLACE_MAP[c.place ?? ''] ?? '—'}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="case-card-delete"
                    onClick={e => { e.stopPropagation(); onDelete(c.id); }}
                  >
                    Delete
                  </button>
                </div>
                {expanded && (
                  <div className="case-card-expanded">
                    <div><span className="k">Other classification: </span>{c.otherClassification || '—'}</div>
                    <div><span className="k">Approach: </span>{c.approach || '—'}</div>
                    <div><span className="k">Position: </span>{c.position || '—'}</div>
                    <div><span className="k">Type of procedure: </span>{PROC_MAP[c.procedureType ?? ''] ?? '—'}</div>
                    <div className="full"><span className="k">Procedure: </span>{c.procedure || '—'}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-log">No cases logged yet. Add your first case in New Entry.</div>
      )}
    </div>
  );
}
