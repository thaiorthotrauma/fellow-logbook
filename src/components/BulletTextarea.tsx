import type { ChangeEvent, KeyboardEvent } from 'react';

interface BulletTextareaProps {
  className?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  /** Hard cap on the number of lines — Enter is blocked once reached, and a
   *  paste that would exceed it is truncated. Defaults to `rows`. */
  maxRows?: number;
}

const BULLET = '- ';

function capitalizeLine(line: string): string {
  const m = /^(-\s*)(.*)$/.exec(line);
  if (m) {
    const [, prefix, rest] = m;
    return prefix + (rest ? rest[0].toUpperCase() + rest.slice(1) : rest);
  }
  return line ? line[0].toUpperCase() + line.slice(1) : line;
}

function capitalizeLines(text: string): string {
  return text.split('\n').map(capitalizeLine).join('\n');
}

/** Sets the DOM node's value/selection synchronously (not via a later
 *  render), then commits the same string to React state. Doing the DOM write
 *  first avoids a race: restoring the caret in a requestAnimationFrame (a
 *  render or more later) lags behind fast/automated typing, so the next
 *  keystroke lands at the stale position and garbles the text — this was
 *  observed and reproduced with scripted rapid typing. Writing `el.value`
 *  ourselves first means the caret is already correct before the browser
 *  processes anything else, and the later React re-render with the identical
 *  string is a no-op for both content and cursor. */
function commit(el: HTMLTextAreaElement, next: string, cursor: number, onChange: (value: string) => void) {
  el.value = next;
  const pos = Math.min(cursor, next.length);
  el.setSelectionRange(pos, pos);
  onChange(next);
}

/** A textarea for short structured notes:
 *   - Enter starts a new "- " bulleted line automatically, from the very
 *     first row (the first character typed gets bulleted too).
 *   - Pressing Enter again on an empty bullet removes it and exits the list,
 *     rather than piling up blank bullets (Notion/Word-style).
 *   - Capped at `maxRows` lines — once reached, Enter does nothing further,
 *     and a paste that would add more lines is truncated.
 *   - The first letter of each row is auto-capitalized as you type. */
export default function BulletTextarea({ className, value, onChange, placeholder, rows, maxRows }: BulletTextareaProps) {
  const cap = maxRows ?? rows ?? 3;

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    let cursor = el.selectionStart;
    let raw = el.value;

    // Auto-bullet from the very first character, not just after an Enter.
    if (value === '' && raw !== '' && !raw.startsWith(BULLET)) {
      raw = BULLET + raw;
      cursor += BULLET.length;
    }

    // Hard cap on rows — trims a paste that would exceed it.
    const lines = raw.split('\n');
    if (lines.length > cap) {
      raw = lines.slice(0, cap).join('\n');
    }

    raw = capitalizeLines(raw);
    commit(el, raw, cursor, onChange);
  }

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

    if (/^-\s*$/.test(currentLine)) {
      // Empty bullet — exit the list instead of adding another.
      const next = before.slice(0, lineStart) + after;
      commit(el, next, lineStart, onChange);
      return;
    }

    // Blocked once at the row cap — nothing more to add.
    if (value.split('\n').length >= cap) return;

    const insert = `\n${BULLET}`;
    const next = before + insert + after;
    commit(el, next, before.length + insert.length, onChange);
  }

  return (
    <textarea
      className={className}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      rows={rows}
    />
  );
}
