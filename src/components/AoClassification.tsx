import type { Dispatch, SetStateAction } from 'react';
import aoBodyDiagram from '../assets/ao-body-diagram.svg';
import { GROUP_OPTS, REGIONS, TYPE_OPTS } from '../data';
import type { AoState } from '../types';
import { computeAoCode, findRegion } from '../logic';
import Pill from './Pill';

interface AoClassificationProps {
  ao: AoState;
  setAo: Dispatch<SetStateAction<AoState>>;
}

export default function AoClassification({ ao, setAo }: AoClassificationProps) {
  const region = findRegion(ao.regionKey);
  const code = computeAoCode(ao);

  const selectRegion = (key: string | null) =>
    setAo(a => ({ ...a, regionKey: key, boneKey: null, segmentCode: null, subtypeCode: null }));
  const selectBone = (boneKey: string) => setAo(a => ({ ...a, boneKey, segmentCode: null }));
  const selectSegment = (segmentCode: string) => setAo(a => ({ ...a, segmentCode }));
  const selectSubtype = (subtypeCode: string) => setAo(a => ({ ...a, subtypeCode }));
  const selectType = (t: string) => setAo(a => ({ ...a, type: a.type === t ? null : t }));
  const selectGroup = (g: string) => setAo(a => ({ ...a, group: a.group === g ? null : g }));
  const clearAo = () => setAo({ regionKey: null, boneKey: null, segmentCode: null, subtypeCode: null, type: null, group: null, code: '' });

  let boneSegmentOptions: { code: string; label: string }[] = [];
  const chosenBone = region?.bones?.find(b => b.key === ao.boneKey);
  if (region?.bones) {
    boneSegmentOptions = chosenBone ? chosenBone.segments : [];
  } else if (region?.segments) {
    boneSegmentOptions = region.segments;
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="step-badge">6</span>
        <span className="step-title">AO classification</span>
        <span className="pair-tag">Answer #6 or #7</span>
        {code && <span className="ao-code-badge">{code}</span>}
      </div>
      <div className="ao-hint">Click a region on the diagram, or use the dropdown, to classify the fracture location.</div>

      <div className="ao-layout">
        <div className="ao-diagram-wrap">
          <div className="ao-diagram-stage">
            <img src={aoBodyDiagram} alt="AO anatomic region diagram" className="ao-diagram-img" />
            {REGIONS.map(r => (
              <button
                type="button"
                key={r.key}
                className={`ao-dot ${ao.regionKey === r.key ? 'selected' : ''}`}
                style={{ left: r.x + '%', top: r.y + '%' }}
                onClick={() => selectRegion(r.key)}
                title={r.name}
              >
                {r.pin ?? r.code}
              </button>
            ))}
          </div>
        </div>

        <div className="ao-detail-panel">
          <select
            className="field-select"
            value={ao.regionKey ?? ''}
            onChange={e => selectRegion(e.target.value || null)}
            style={{ marginBottom: 16 }}
          >
            <option value="">Select region…</option>
            {REGIONS.map(r => (
              <option key={r.key} value={r.key}>{r.name} ({r.code})</option>
            ))}
          </select>

          {region && (
            <div>
              <div className="ao-region-name">{region.name} ({region.code})</div>

              {region.bones && (
                <div className="ao-field-block">
                  <div className="sub-label">Bone</div>
                  <div className="pill-row">
                    {region.bones.map(b => (
                      <Pill key={b.key} label={b.label} selected={ao.boneKey === b.key} onClick={() => selectBone(b.key)} />
                    ))}
                  </div>
                </div>
              )}

              {boneSegmentOptions.length > 0 && (
                <div className="ao-field-block">
                  <div className="sub-label">Segment</div>
                  <div className="pill-row">
                    {boneSegmentOptions.map(seg => (
                      <Pill key={seg.code} label={seg.label} selected={ao.segmentCode === seg.code} onClick={() => selectSegment(seg.code)} />
                    ))}
                  </div>
                </div>
              )}

              {region.subtypes && (
                <div className="ao-field-block">
                  <div className="sub-label">Specific bone</div>
                  <div className="pill-row">
                    {region.subtypes.map(st => (
                      <Pill key={st.code} label={st.label} selected={ao.subtypeCode === st.code} onClick={() => selectSubtype(st.code)} />
                    ))}
                  </div>
                </div>
              )}

              <div className="ao-field-block">
                <div className="sub-label">Fracture type</div>
                <div className="pill-row">
                  {TYPE_OPTS.map(ty => (
                    <Pill key={ty.code} label={ty.label} selected={ao.type === ty.code} onClick={() => selectType(ty.code)} title={ty.desc} />
                  ))}
                </div>
              </div>

              <div className="ao-field-block">
                <div className="sub-label">Group (optional)</div>
                <div className="pill-row">
                  {GROUP_OPTS.map(g => (
                    <Pill key={g} label={`Group ${g}`} selected={ao.group === g} onClick={() => selectGroup(g)} />
                  ))}
                </div>
              </div>

              <div className="ao-code-row">
                <input
                  type="text"
                  className="ao-code-input"
                  value={code}
                  onChange={e => setAo(a => ({ ...a, code: e.target.value }))}
                  placeholder="AO/OTA code"
                />
                <button type="button" className="ao-clear" onClick={clearAo}>Clear</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
