import { useEffect, useState } from 'react';
import './App.css';
import { REQUIRED } from './data';
import { computeAoCode, findRegion } from './logic';
import { deleteCaseById, fetchCases, insertCase } from './lib/casesApi';
import { emptyAo, emptyForm, type AoState, type CaseEntry, type FormState } from './types';
import NewEntryForm from './components/NewEntryForm';
import CaseLog from './components/CaseLog';

const DESKTOP_BREAKPOINT = 1024;

type Tab = 'form' | 'log';

function App() {
  const [tab, setTab] = useState<Tab>('form');
  const [cases, setCases] = useState<CaseEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [ao, setAo] = useState<AoState>(emptyAo());
  const [isDesktop, setIsDesktop] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCases()
      .then(setCases)
      .catch(err => {
        console.error(err);
        setToast('Could not load your cases. Check your connection and reload.');
      });

    const checkViewport = () => setIsDesktop(window.innerWidth > DESKTOP_BREAKPOINT);
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function validate(): string[] {
    return REQUIRED.filter(r => !form[r.key]).map(r => r.label);
  }

  function resetForm() {
    setForm(emptyForm());
    setAo(emptyAo());
    setErrors([]);
  }

  async function handleSubmit() {
    const missing = validate();
    if (missing.length) {
      setErrors(missing);
      return;
    }
    setSaving(true);
    try {
      const region = findRegion(ao.regionKey);
      const entry = await insertCase(form, computeAoCode(ao), region ? region.name : '');
      setCases(prev => [...prev, entry]);
      setErrors([]);
      setForm(emptyForm());
      setAo(emptyAo());
      setToast('Case saved to logbook');
    } catch (err) {
      console.error(err);
      setToast('Could not save this case. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteCase(id: string) {
    const previous = cases;
    setCases(cases.filter(c => c.id !== id));
    try {
      await deleteCaseById(id);
    } catch (err) {
      console.error(err);
      setCases(previous);
      setToast('Could not delete this case. Please try again.');
    }
  }

  if (isDesktop) {
    return (
      <div className="desktop-gate">
        <div className="desktop-gate-inner">
          <div className="desktop-gate-badge">!</div>
          <div className="desktop-gate-title">Mobile &amp; Tablet Only</div>
          <div className="desktop-gate-body">
            This logbook is designed for use on mobile phones and tablets in the operating room and ward.
            Please open it on a smaller screen, or narrow this browser window, to continue.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div>
          <div className="header-title">Fellowship Case Logbook</div>
          <div className="header-subtitle">Orthopedic Traumatology Fellowship — Operative Case Record</div>
        </div>
        <div className="tabs">
          <button type="button" className={`tab ${tab === 'form' ? 'active' : ''}`} onClick={() => setTab('form')}>
            New Entry
          </button>
          <button type="button" className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
            Case Log ({cases.length})
          </button>
        </div>
      </div>

      <div className="content">
        {tab === 'form' ? (
          <NewEntryForm
            form={form}
            ao={ao}
            errors={errors}
            updateForm={updateForm}
            setAo={setAo}
            onReset={resetForm}
            onSubmit={handleSubmit}
            saving={saving}
          />
        ) : (
          <CaseLog
            cases={cases}
            expandedId={expandedId}
            onToggle={id => setExpandedId(cur => (cur === id ? null : id))}
            onDelete={deleteCase}
          />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
