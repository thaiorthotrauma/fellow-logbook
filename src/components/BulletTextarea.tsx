import type { KeyboardEvent } from 'react';

interface BulletTextareaProps {
  className?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

/** A textarea where Enter starts a new "- " bulleted line automatically.
 *  Pressing Enter again on an empty bullet (nothing typed after "- ") removes
 *  it instead of adding another, so the list ends cleanly rather than piling
 *  up blank bullets — the same feel as Notion/Word auto-lists. */
export default function BulletTextarea({ className, value, onChange, placeholder, rows }: BulletTextareaProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const lineStart = before.lastIndexOf('\n') + 1;
    const currentLine = before.slice(lineStart);

    let next: string;
    let cursor: number;
    if (/^-\s*$/.test(currentLine)) {
      // Empty bullet — exit the list instead of adding another.
      next = before.slice(0, lineStart) + after;
      cursor = lineStart;
    } else {
      const insert = '\n- ';
      next = before + insert + after;
      cursor = before.length + insert.length;
    }

    onChange(next);
    // The textarea is controlled by `value`, so the caret resets on
    // re-render; restore it on the same DOM node once the new value lands.
    requestAnimationFrame(() => el.setSelectionRange(cursor, cursor));
  }

  return (
    <textarea
      className={className}
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={rows}
    />
  );
}
