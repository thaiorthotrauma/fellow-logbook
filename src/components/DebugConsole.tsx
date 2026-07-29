import { useEffect, useState } from 'react';
import { clearDebugLog, getDebugLog, subscribeDebugLog, type LogEntry } from '../lib/debugLog';

// A visible, always-reachable log drawer for debugging inside the LIFF
// in-app browser, where there's no devtools console to open.
export default function DebugConsole() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>(getDebugLog());
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => subscribeDebugLog(() => setEntries([...getDebugLog()])), []);

  const text = entries.map(e => `[${e.time}] ${e.level.toUpperCase()} ${e.text}`).join('\n');

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('no clipboard API');
      }
      setCopyStatus('copied');
    } catch {
      // Fallback for browsers (LIFF webviews) that block navigator.clipboard:
      // select a hidden textarea's contents and use the legacy copy command.
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand('copy');
        setCopyStatus('copied');
      } catch {
        setCopyStatus('failed');
      } finally {
        document.body.removeChild(el);
      }
    }
    setTimeout(() => setCopyStatus('idle'), 2000);
  }

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200, fontFamily: 'monospace' }}>
      {open && (
        <div
          style={{
            height: '45vh',
            background: '#111',
            color: '#0f0',
            overflowY: 'auto',
            padding: '8px',
            fontSize: '11px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            borderTop: '2px solid #444',
          }}
        >
          {entries.length === 0 ? (
            <div style={{ color: '#888' }}>No logs yet.</div>
          ) : (
            entries.map((e, i) => (
              <div key={i} style={{ color: e.level === 'error' ? '#f66' : e.level === 'warn' ? '#fd6' : '#0f0' }}>
                [{e.time}] {e.level.toUpperCase()} {e.text}
              </div>
            ))
          )}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#222',
          color: '#fff',
          padding: '6px 10px',
          fontSize: '12px',
        }}
      >
        <button type="button" onClick={() => setOpen(o => !o)} style={debugBtnStyle}>
          {open ? 'Hide log' : `Show log (${entries.length})`}
        </button>
        {open && (
          <>
            <button type="button" onClick={copy} style={debugBtnStyle}>
              {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Copy failed' : 'Copy log'}
            </button>
            <button type="button" onClick={clearDebugLog} style={debugBtnStyle}>
              Clear
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const debugBtnStyle: React.CSSProperties = {
  background: '#444',
  color: '#fff',
  border: '1px solid #666',
  borderRadius: '4px',
  padding: '4px 8px',
  fontSize: '12px',
};
