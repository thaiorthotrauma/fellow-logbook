// Captures console output and uncaught errors into an in-memory ring buffer,
// so they can be viewed/copied from inside the LIFF in-app browser where
// devtools aren't reachable. Import this before anything else so early boot
// logs (auth bootstrap, etc.) aren't missed.

export type LogEntry = { time: string; level: 'log' | 'info' | 'warn' | 'error'; text: string };

const MAX_ENTRIES = 500;
const entries: LogEntry[] = [];
const listeners = new Set<() => void>();

function push(level: LogEntry['level'], args: unknown[]) {
  const text = args
    .map(a => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  entries.push({ time: new Date().toISOString().slice(11, 23), level, text });
  if (entries.length > MAX_ENTRIES) entries.shift();
  listeners.forEach(fn => fn());
}

const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

console.log = (...args: unknown[]) => {
  push('log', args);
  original.log(...args);
};
console.info = (...args: unknown[]) => {
  push('info', args);
  original.info(...args);
};
console.warn = (...args: unknown[]) => {
  push('warn', args);
  original.warn(...args);
};
console.error = (...args: unknown[]) => {
  push('error', args);
  original.error(...args);
};

window.addEventListener('error', event => {
  push('error', [`Uncaught: ${event.message}`, `at ${event.filename}:${event.lineno}:${event.colno}`]);
});
window.addEventListener('unhandledrejection', event => {
  push('error', ['Unhandled rejection:', event.reason]);
});

export function getDebugLog(): LogEntry[] {
  return entries;
}

export function clearDebugLog() {
  entries.length = 0;
  listeners.forEach(fn => fn());
}

export function subscribeDebugLog(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
