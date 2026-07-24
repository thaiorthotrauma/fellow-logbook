import type { Dispatch, SetStateAction } from 'react';
import { OPTIME, PLACE, PROC_TYPE, ROLES, TIMING } from '../data';
import type { AoState, FormState } from '../types';
import AoClassification from './AoClassification';
import BulletTextarea from './BulletTextarea';
import ImageUpload from './ImageUpload';
import Pill from './Pill';

interface NewEntryFormProps {
  form: FormState;
  ao: AoState;
  errors: string[];
  images: File[];
  updateForm: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  setAo: Dispatch<SetStateAction<AoState>>;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onReset: () => void;
  onSubmit: () => void;
  saving: boolean;
}

/** HN allows only digits, '/', '-', and single spaces — strip everything else
 *  and collapse runs of spaces as the fellow types. */
function sanitizeHn(value: string): string {
  return value.replace(/[^0-9/\- ]/g, '').replace(/ {2,}/g, ' ');
}

export default function NewEntryForm({ form, ao, errors, images, updateForm, setAo, onAddImages, onRemoveImage, onReset, onSubmit, saving }: NewEntryFormProps) {
  return (
    <div>
      {errors.length > 0 && (
        <div className="error-banner">Please complete: {errors.join(', ')}</div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="step-badge">1</span>
          <span className="step-title">Date of Operation</span>
          <span className="required-star">*</span>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="date"
            className="field-input"
            style={{ width: 'auto' }}
            value={form.date}
            onChange={e => updateForm('date', e.target.value)}
          />
          <div className="pill-row">
            {TIMING.map(opt => (
              <Pill key={opt.value} label={opt.label} selected={form.timing === opt.value} onClick={() => updateForm('timing', opt.value)} />
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">2</span>
          <span className="step-title">Place</span>
          <span className="required-star">*</span>
        </div>
        <div className="pill-row">
          {PLACE.map(opt => (
            <Pill key={opt.value} label={opt.label} selected={form.place === opt.value} onClick={() => updateForm('place', opt.value)} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">3</span>
          <span className="step-title">Staff</span>
          <span className="required-star">*</span>
        </div>
        <input
          type="text"
          className="field-input"
          value={form.staff}
          onChange={e => updateForm('staff', e.target.value)}
          placeholder="e.g. Attending / consultant name"
        />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">4</span>
          <span className="step-title">HN</span>
          <span className="required-star">*</span>
        </div>
        <input
          type="text"
          className="field-input"
          value={form.hn}
          onChange={e => updateForm('hn', sanitizeHn(e.target.value))}
          inputMode="numeric"
          placeholder="e.g. 12-34-56"
        />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">5</span>
          <span className="step-title">Diagnosis</span>
          <span className="required-star">*</span>
        </div>
        <BulletTextarea
          className="field-textarea"
          value={form.diagnosis}
          onChange={v => updateForm('diagnosis', v)}
          placeholder="e.g. Closed fracture right distal femur"
          rows={3}
        />
      </div>

      <AoClassification ao={ao} setAo={setAo} />

      <div className="card">
        <div className="card-header">
          <span className="step-badge">7</span>
          <span className="step-title">Other Classification</span>
          <span className="pair-tag">Answer #6 or #7</span>
        </div>
        <BulletTextarea
          className="field-textarea"
          value={form.otherClassification}
          onChange={v => updateForm('otherClassification', v)}
          placeholder="e.g. Schatzker, Weber, Gustilo-Anderson…"
          rows={3}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">8</span>
          <span className="step-title">Approach</span>
          <span className="required-star">*</span>
        </div>
        <BulletTextarea
          className="field-textarea"
          value={form.approach}
          onChange={v => updateForm('approach', v)}
          placeholder="e.g. Anterolateral"
          rows={3}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">9</span>
          <span className="step-title">Procedure(s)</span>
          <span className="required-star">*</span>
        </div>
        <BulletTextarea
          className="field-textarea"
          value={form.procedure}
          onChange={v => updateForm('procedure', v)}
          placeholder="Describe the procedure(s) performed…"
          rows={3}
        />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">10</span>
          <span className="step-title">Type of Procedure</span>
          <span className="required-star">*</span>
        </div>
        <div className="pill-row">
          {PROC_TYPE.map(opt => (
            <Pill key={opt.value} label={opt.label} selected={form.procedureType === opt.value} onClick={() => updateForm('procedureType', opt.value)} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">11</span>
          <span className="step-title">Your Role</span>
          <span className="required-star">*</span>
        </div>
        <div className="pill-grid-2">
          {ROLES.map(opt => (
            <Pill key={opt.value} label={opt.label} selected={form.role === opt.value} onClick={() => updateForm('role', opt.value)} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">12</span>
          <span className="step-title">Operative Time (skin to skin)</span>
          <span className="required-star">*</span>
        </div>
        <div className="pill-row">
          {OPTIME.map(opt => (
            <Pill key={opt.value} label={opt.label} selected={form.opTime === opt.value} onClick={() => updateForm('opTime', opt.value)} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">13</span>
          <span className="step-title">Image(s)</span>
          <span className="optional-tag">Optional</span>
        </div>
        <div className="field-label" style={{ marginBottom: 12 }}>
          i.e. pre &amp; post-op films, intra-op findings
        </div>
        <ImageUpload images={images} onAdd={onAddImages} onRemove={onRemoveImage} />
      </div>

      <div className="card">
        <div className="card-header">
          <span className="step-badge">14</span>
          <span className="step-title">Memo</span>
          <span className="optional-tag">Optional</span>
        </div>
        <BulletTextarea
          className="field-textarea"
          value={form.memo}
          onChange={v => updateForm('memo', v)}
          placeholder="Any notes for yourself…"
          rows={3}
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn-secondary" onClick={onReset}>Reset</button>
        <button type="button" className="btn-primary" onClick={onSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Case'}
        </button>
      </div>
    </div>
  );
}
