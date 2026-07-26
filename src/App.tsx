import { useEffect, useState } from 'react';
import './App.css';
import { REQUIRED } from './data';
import { computeAoCode, findRegion } from './logic';
import {
  deleteCaseById,
  deleteDriveImages,
  diffCaseColumns,
  fetchCases,
  insertCase,
  notifyCase,
  updateCase,
  uploadCaseImages,
  MAX_IMAGES_TOTAL_BYTES,
} from './lib/casesApi';
import { fetchCurrentPhysician, type Physician } from './lib/physicianApi';
import { fetchStaffCases, fetchStaffProfile, type StaffProfile } from './lib/staffApi';
import { getAppView } from './lib/appView';
import { parseAoCode } from './lib/aoCode';
import { describeError } from './lib/errors';
import { emptyAo, emptyForm, formFromEntry, type AoState, type CaseEntry, type FormState, type StaffCaseEntry } from './types';
import NewEntryForm from './components/NewEntryForm';
import CaseLog from './components/CaseLog';
import ExportPdfPanel from './components/ExportPdfPanel';
import StaffExportPdfPanel from './components/StaffExportPdfPanel';

type Tab = 'form' | 'log' | 'pdf';

// Read once — the URL doesn't change within a session (no router), and this
// is what tells the app apart from a normal fellow open: 'staff' is the rich
// menu's "Fellow Cases" button, 'demo' is "Logbook Demo". See lib/appView.ts.
const view = getAppView();

function App() {
  const [tab, setTab] = useState<Tab>(view === 'staff' ? 'log' : 'form');
  const [cases, setCases] = useState<CaseEntry[]>([]);
  const [physician, setPhysician] = useState<Physician | null>(null);
  const [staffCases, setStaffCases] = useState<StaffCaseEntry[]>([]);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(view !== 'demo');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; sticky: boolean } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [ao, setAo] = useState<AoState>(emptyAo());
  const [images, setImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  /** Id of the case being edited, or null when the form is logging a new case. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** The edited case's saved images that are still being kept. */
  const [keptImages, setKeptImages] = useState<string[]>([]);
  /** Its image set as loaded, so removals can be detected on save. */
  const [savedImages, setSavedImages] = useState<string[]>([]);

  const isStaff = staffProfile !== null;
  const isDemo = view === 'demo';

  useEffect(() => {
    // Demo mode touches no account and no real data at all — "voluntary
    // empty log" means never fetched, not just displayed as empty.
    if (isDemo) return;

    let cancelled = false;

    // Tried in parallel rather than "fellow, then staff if not" — AuthGate
    // has already resolved which one this session actually is (the two use
    // unrelated auth.uid()s), so at most one of these ever finds a row; this
    // just reads whichever it is without re-deriving that decision here.
    Promise.all([
      fetchCurrentPhysician().catch(err => {
        console.error(err);
        return null;
      }),
      fetchStaffProfile().catch(err => {
        console.error(err);
        return null;
      }),
    ])
      .then(([p, s]) => {
        if (cancelled) return;
        setPhysician(p);
        setStaffProfile(s);

        if (p) {
          fetchCases()
            .then(c => !cancelled && setCases(c))
            .catch(err => {
              console.error(err);
              if (!cancelled) {
                setToast({ message: 'Could not load your cases. Check your connection and reload.', sticky: false });
              }
            });
        } else if (s) {
          setTab(cur => (cur === 'form' ? 'log' : cur)); // no New Entry tab for staff
          fetchStaffCases()
            .then(c => !cancelled && setStaffCases(c))
            .catch(err => {
              console.error(err);
              if (!cancelled) {
                setToast({ message: 'Could not load cases. Check your connection and reload.', sticky: false });
              }
            });
        }
      })
      .finally(() => !cancelled && setProfileLoading(false));

    return () => {
      cancelled = true;
    };
  }, [isDemo]);

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
    setEditingId(null);
    setKeptImages([]);
    setSavedImages([]);
  }

  /** Opens a saved case in the entry form. The AO picker's structured selection
   *  is rebuilt from the stored code so the diagram/pills come back preselected
   *  rather than blank. */
  function startEdit(id: string) {
    const target = cases.find(c => c.id === id);
    if (!target) return;
    setForm(formFromEntry(target));
    setAo(parseAoCode(target.aoCode, target.aoRegionLabel));
    setImages([]);
    setKeptImages(target.imagePaths);
    setSavedImages(target.imagePaths);
    setErrors([]);
    setEditingId(id);
    setTab('form');
  }

  function cancelEdit() {
    resetForm();
    setTab('log');
  }

  /** Shared pre-flight for both saving a new case and saving an edit. */
  function checkBeforeSave(): boolean {
    const missing = validate();
    if (missing.length) {
      setErrors(missing);
      return false;
    }
    const totalImageBytes = images.reduce((sum, f) => sum + f.size, 0);
    if (totalImageBytes > MAX_IMAGES_TOTAL_BYTES) {
      setToast({ message: 'Total image size exceeds 10 MB. Remove some images to save.', sticky: false });
      return false;
    }
    return true;
  }

  async function saveEdit(id: string) {
    if (!checkBeforeSave()) return;
    // Captured before the update so the notification can report what changed.
    const before = cases.find(c => c.id === id);
    setSaving(true);
    // Name new uploads past the case's existing ones so an edit can't reuse a
    // filename already in the Drive folder.
    let addedIds: string[] = [];
    try {
      addedIds = await uploadCaseImages(id, images, savedImages.length);
      const region = findRegion(ao.regionKey);
      const entry = await updateCase(id, form, computeAoCode(ao), region ? region.name : '', [
        ...keptImages,
        ...addedIds,
      ]);
      setCases(prev => prev.map(c => (c.id === id ? entry : c)));
      // Advisory only, and skipped when the save changed nothing.
      if (before) {
        const previous = diffCaseColumns(before, entry);
        if (Object.keys(previous).length > 0) void notifyCase('updated', id, previous);
      }
      // Drop de-selected images only now that the row no longer points at them,
      // so a failed update never leaves the case referencing deleted files.
      void deleteDriveImages(savedImages.filter(p => !keptImages.includes(p)));
      resetForm();
      setTab('log');
      setExpandedId(id);
      setToast({ message: 'Case updated', sticky: false });
    } catch (err) {
      console.error(err);
      // The row still references the original images, so this edit's uploads
      // are now orphaned — remove them.
      void deleteDriveImages(addedIds);
      setToast({ message: `Could not save: ${describeError(err)}`, sticky: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (editingId) {
      await saveEdit(editingId);
      return;
    }
    if (!checkBeforeSave()) return;
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
      // Advisory only, so it runs after the save is committed and isn't awaited.
      void notifyCase('created', entry.id);
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
    // Abandon an in-progress edit of this case — its row is going away, so
    // saving the form later could only fail.
    if (editingId === id) resetForm();
    setCases(cases.filter(c => c.id !== id));
    try {
      // Notified (and awaited) before the row is gone: unlike created/updated,
      // a deleted row can't be re-read afterward, so the server builds this
      // message from the still-live row. notifyCase never throws, so this
      // can't turn a Telegram problem into a failed delete.
      await notifyCase('deleted', id);
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
          {isDemo ? (
            <>
              <div className="header-title">Logbook Demo</div>
              <div className="header-subtitle">A preview of the fellow experience — nothing here is saved</div>
            </>
          ) : profileLoading ? (
            <div className="header-skeleton" aria-hidden="true">
              <div className="skeleton skeleton-title" />
              <div className="skeleton skeleton-inst" />
              <div className="skeleton skeleton-sub" />
            </div>
          ) : isStaff ? (
            <>
              <div className="header-title">{staffProfile!.fullName}</div>
              <div className="header-institution">Institution : {staffProfile!.institution}</div>
              <div className="header-subtitle">Staff view — read only</div>
            </>
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
          {!isStaff && (
            <button type="button" className={`tab ${tab === 'form' ? 'active' : ''}`} onClick={() => setTab('form')}>
              {editingId ? 'Edit Case' : 'New Entry'}
            </button>
          )}
          <button type="button" className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
            {isStaff ? `Institution Cases (${staffCases.length})` : `Case Log (${cases.length})`}
          </button>
          <button type="button" className={`tab ${tab === 'pdf' ? 'active' : ''}`} onClick={() => setTab('pdf')}>
            PDF
          </button>
        </div>
      </div>

      <div className="content">
        {tab === 'form' && !isStaff && (
          <>
            {isDemo && <div className="demo-banner">Demo — inputs are disabled and nothing is saved.</div>}
            <div className={isDemo ? 'demo-inert' : undefined}>
              <NewEntryForm
                form={form}
                ao={ao}
                errors={errors}
                images={images}
                updateForm={updateForm}
                setAo={setAo}
                onAddImages={files => setImages(prev => [...prev, ...files])}
                onRemoveImage={index => setImages(prev => prev.filter((_, i) => i !== index))}
                onReset={editingId ? cancelEdit : resetForm}
                onSubmit={handleSubmit}
                saving={saving}
                editing={editingId !== null}
                existingImages={editingId ? keptImages : undefined}
                onRemoveExistingImage={
                  editingId ? index => setKeptImages(prev => prev.filter((_, i) => i !== index)) : undefined
                }
              />
            </div>
          </>
        )}
        {tab === 'log' && isStaff && (
          <CaseLog
            cases={staffCases}
            expandedId={expandedId}
            onToggle={id => setExpandedId(cur => (cur === id ? null : id))}
            emptyMessage="No cases logged yet by any fellow at this institution."
          />
        )}
        {tab === 'log' && !isStaff && (
          <CaseLog
            cases={cases}
            expandedId={expandedId}
            onToggle={id => setExpandedId(cur => (cur === id ? null : id))}
            onEdit={startEdit}
            onDelete={deleteCase}
          />
        )}
        {tab === 'pdf' && isStaff && (
          <StaffExportPdfPanel
            cases={staffCases}
            institution={staffProfile!.institution}
            profileLoading={profileLoading}
          />
        )}
        {tab === 'pdf' && !isStaff && (
          <ExportPdfPanel
            cases={cases}
            fellowName={physician?.fullName ?? ''}
            institution={physician?.institution ?? null}
            profileLoading={profileLoading}
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
