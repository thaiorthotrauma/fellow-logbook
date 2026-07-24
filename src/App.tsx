import { useEffect, useState } from 'react';
import './App.css';
import { REQUIRED } from './data';
import { computeAoCode, findRegion } from './logic';
import {
  deleteCaseById,
  deleteDriveImages,
  fetchCases,
  insertCase,
  uploadCaseImages,
  MAX_IMAGES_TOTAL_BYTES,
} from './lib/casesApi';
import { fetchCurrentPhysician, type Physician } from './lib/physicianApi';
import { describeError } from './lib/errors';
import { emptyAo, emptyForm, type AoState, type CaseEntry, type FormState } from './types';
import NewEntryForm from './components/NewEntryForm';
import CaseLog from './components/CaseLog';
import ExportPdfPanel from './components/ExportPdfPanel';

type Tab = 'form' | 'log' | 'pdf';

function App() {
  const [tab, setTab] = useState<Tab>('form');
  const [cases, setCases] = useState<CaseEntry[]>([]);
  const [physician, setPhysician] = useState<Physician | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; sticky: boolean } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [ao, setAo] = useState<AoState>(emptyAo());
  const [images, setImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCases()
      .then(setCases)
      .catch(err => {
        console.error(err);
        setToast({ message: 'Could not load your cases. Check your connection and reload.', sticky: false });
      });

    fetchCurrentPhysician()
      .then(setPhysician)
      .catch(err => console.error(err))
      .finally(() => setProfileLoading(false));
  }, []);

  useEffect(() => {
    if (!toast || toast.sticky) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function validate(): string[] {
    const missing = REQUIRED.filter(r => !form[r.key]).map(r => r.label);
    // Q3 (AO classification) and Q4 (Other classification): at least one.
    const hasAo = computeAoCode(ao).trim() !== '';
    const hasOther = form.otherClassification.trim() !== '';
    if (!hasAo && !hasOther) missing.push('AO classification or Other classification');
    return missing;
  }

  function resetForm() {
    setForm(emptyForm());
    setAo(emptyAo());
    setImages([]);
    setErrors([]);
  }

  async function handleSubmit() {
    const missing = validate();
    if (missing.length) {
      setErrors(missing);
      return;
    }
    const totalImageBytes = images.reduce((sum, f) => sum + f.size, 0);
    if (totalImageBytes > MAX_IMAGES_TOTAL_BYTES) {
      setToast({ message: 'Total image size exceeds 10 MB. Remove some images to save.', sticky: false });
      return;
    }
    setSaving(true);
    // Generate the id up front so images can be named per-case and uploaded to
    // Drive before the row exists. If any upload fails we abort before
    // inserting, so we never create a case that's missing its images.
    const caseId = crypto.randomUUID();
    let imagePaths: string[] = [];
    try {
      imagePaths = await uploadCaseImages(caseId, images);
      const region = findRegion(ao.regionKey);
      const entry = await insertCase(caseId, form, computeAoCode(ao), region ? region.name : '', imagePaths);
      setCases(prev => [...prev, entry]);
      setErrors([]);
      setForm(emptyForm());
      setAo(emptyAo());
      setImages([]);
      setToast({ message: 'Case saved to logbook', sticky: false });
    } catch (err) {
      console.error(err);
      // If images uploaded but the row didn't save, remove the now-orphaned
      // Drive files so patient images don't linger unreferenced.
      void deleteDriveImages(imagePaths);
      setToast({ message: `Could not save: ${describeError(err)}`, sticky: true });
    } finally {
      setSaving(false);
    }
  }

  async function deleteCase(id: string) {
    const target = cases.find(c => c.id === id);
    const previous = cases;
    setCases(cases.filter(c => c.id !== id));
    try {
      await deleteCaseById(id, target?.imagePaths ?? []);
    } catch (err) {
      console.error(err);
      setCases(previous);
      setToast({ message: `Could not delete: ${describeError(err)}`, sticky: true });
    }
  }

  return (
    <div className="app">
      <div className="header">
        <div>
          {profileLoading ? (
            <div className="header-skeleton" aria-hidden="true">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-inst" />
              <div className="skeleton skeleton-sub" />
            </div>
          ) : (
            <>
              <div className="header-title">{physician?.fullName ?? ' '}</div>
              {physician?.institution && (
                <div className="header-institution">Institution : {physician.institution}</div>
              )}
              <div className="header-subtitle">Operative case record : year 2026 - 2027</div>
            </>
          )}
        </div>
        <div className="tabs">
          <button type="button" className={`tab ${tab === 'form' ? 'active' : ''}`} onClick={() => setTab('form')}>
            New Entry
          </button>
          <button type="button" className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
            Case Log ({cases.length})
          </button>
          <button type="button" className={`tab ${tab === 'pdf' ? 'active' : ''}`} onClick={() => setTab('pdf')}>
            PDF
          </button>
        </div>
      </div>

      <div className="content">
        {tab === 'form' && (
          <NewEntryForm
            form={form}
            ao={ao}
            errors={errors}
            images={images}
            updateForm={updateForm}
            setAo={setAo}
            onAddImages={files => setImages(prev => [...prev, ...files])}
            onRemoveImage={index => setImages(prev => prev.filter((_, i) => i !== index))}
            onReset={resetForm}
            onSubmit={handleSubmit}
            saving={saving}
          />
        )}
        {tab === 'log' && (
          <CaseLog
            cases={cases}
            expandedId={expandedId}
            onToggle={id => setExpandedId(cur => (cur === id ? null : id))}
            onDelete={deleteCase}
          />
        )}
        {tab === 'pdf' && (
          <ExportPdfPanel
            cases={cases}
            fellowName={physician?.fullName ?? ''}
            institution={physician?.institution ?? null}
          />
        )}
      </div>

      {toast && (
        <div
          className={`toast ${toast.sticky ? 'toast-sticky' : ''}`}
          onClick={() => toast.sticky && setToast(null)}
          role={toast.sticky ? 'button' : undefined}
        >
          {toast.message}
          {toast.sticky && <span className="toast-dismiss-hint"> (tap to dismiss)</span>}
        </div>
      )}
    </div>
  );
}

export default App;
