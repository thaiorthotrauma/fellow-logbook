// Builds the Telegram message bodies for case activity.
//
// The label maps and text rules here intentionally MIRROR the frontend:
//   labels        → src/data.ts (TIMING / PLACE / ROLE / OPTIME / PROC_TYPE)
//   bullets etc.  → src/lib/textFormat.ts
// Edge Functions run on Deno with no bundler shared with src/, so they can't
// import from there. Kept small and in one place so the mirror is easy to audit;
// the same value sets are also pinned by the CHECK constraints in schema.sql.

import { esc } from './html.ts';

const TIMING_MAP: Record<string, string> = {
  in: 'Official hours',
  out: 'After hours',
};
const PLACE_MAP: Record<string, string> = {
  own: 'Home institution',
  outside: 'Outside institution',
};
const PROC_MAP: Record<string, string> = {
  primary: 'Primary surgery',
  revision: 'Revision surgery',
  staged: 'Staged surgery',
};
const ROLE_MAP: Record<string, string> = {
  primary_surgeon: 'Primary surgeon',
  primary_assistant: 'Primary assist',
  secondary_assistant: 'Secondary assist',
  observer: 'Observer (not scrub in)',
  uncertain: 'Uncertain',
};
const OPTIME_MAP: Record<string, string> = {
  '<1': '< 1 hr',
  '1-2': '1–2 hr',
  '2-3': '2–3 hr',
  '3-4': '3–4 hr',
  '>4': '> 4 hr',
};

/** A case row as stored (snake_case), narrowed to what a notification needs. */
export interface CaseRow {
  date: string;
  timing: string;
  place: string;
  staff: string;
  hn: string;
  diagnosis: string;
  ao_code: string;
  other_classification: string;
  approach: string;
  position: string;
  procedure: string;
  procedure_type: string;
  role: string;
  op_time: string;
  memo: string;
  image_paths: string[] | null;
}

/** Mirrors stripBullets in src/lib/textFormat.ts. */
function stripBullets(text: string): string {
  return (text ?? '').replace(/^[ \t]*-[ \t]+/gm, '').trim();
}

/** Mirrors formatBulletedField: one row plain, several rows each bulleted. */
function bulleted(text: string): string {
  const lines = stripBullets(text)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return lines[0] ?? '';
  return lines.map(l => `• ${l}`).join('\n');
}

/** Mirrors formatClassification: Q6 alone, Q7 alone, or both as a list. */
function classification(aoCode: string, other: string): string {
  const ao = (aoCode ?? '').trim();
  const lines = stripBullets(other)
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  if (ao && lines.length === 0) return `AO/OTA ${ao}`;
  if (!ao && lines.length > 0) return lines.join('\n');
  if (ao && lines.length > 0) return [`• AO/OTA ${ao}`, ...lines.map(l => `• ${l}`)].join('\n');
  return '';
}

/** "2026-07-24" → "24 July 2026", parsed as a plain date (no timezone shift). */
function formatDate(iso: string): string {
  const [y, m, d] = (iso ?? '').split('-').map(Number);
  if (!y || !m || !d) return iso || '—';
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Shows only an HN's last four digits. Telegram sits outside the app's
 *  Supabase + private-Drive perimeter and bot messages persist in chat history
 *  and lock-screen previews, so the full patient identifier is not sent. */
export function maskHn(hn: string): string {
  const digits = (hn ?? '').trim();
  if (digits.length <= 4) return digits || '—';
  return `•••${digits.slice(-4)}`;
}

/** A labelled block, omitted entirely when the value is empty. Leads with a
 *  blank line so consecutive blocks stay visually separate in the chat. */
function block(label: string, value: string): string {
  if (!value) return '';
  return `\n\n<b>${esc(label)}</b>\n${esc(value)}`;
}

function who(fellowName: string, institution: string | null): string {
  const name = esc(fellowName || 'Unknown fellow');
  return institution ? `${name} · ${esc(institution)}` : name;
}

/** Situation 1 — a case was just added. */
export function newCaseMessage(
  row: CaseRow,
  fellowName: string,
  institution: string | null,
  caseNumber: number,
): string {
  const images = (row.image_paths ?? []).length;
  const meta = [
    ROLE_MAP[row.role] ?? '—',
    PROC_MAP[row.procedure_type] ?? '—',
    OPTIME_MAP[row.op_time] ?? '—',
  ];
  if (images > 0) meta.push(`${images} image${images === 1 ? '' : 's'}`);

  return (
    `🆕 <b>New case logged</b>\n` +
    `${who(fellowName, institution)}\n` +
    `${esc(formatDate(row.date))} · ${esc(TIMING_MAP[row.timing] ?? '—')} · ` +
    `${esc(PLACE_MAP[row.place] ?? '—')}\n` +
    `\n<b>Staff</b> ${esc(row.staff || '—')}` +
    `\n<b>HN</b> <code>${esc(maskHn(row.hn))}</code>` +
    block('Diagnosis', bulleted(row.diagnosis)) +
    block('Classification', classification(row.ao_code, row.other_classification)) +
    block('Approach', bulleted(row.approach)) +
    block('Position', row.position) +
    block('Procedure(s)', bulleted(row.procedure)) +
    block('Memo', bulleted(row.memo)) +
    `\n\n${esc(meta.join(' · '))}\n` +
    `Case #${caseNumber} in the logbook`
  );
}

/** Human label + display value for a changed field, used by the edit diff. */
const FIELD_LABELS: Record<string, string> = {
  date: 'Date of operation',
  timing: 'Hours',
  place: 'Place',
  staff: 'Staff',
  hn: 'HN',
  diagnosis: 'Diagnosis',
  ao_code: 'AO/OTA classification',
  other_classification: 'Other classification',
  approach: 'Approach',
  position: 'Position',
  procedure: 'Procedure(s)',
  procedure_type: 'Type of procedure',
  role: 'Your role',
  op_time: 'Operative time',
  memo: 'Memo',
  image_paths: 'Images',
};

/** Renders one field's stored value the way the notification should show it. */
function displayValue(field: string, value: unknown): string {
  if (field === 'image_paths') {
    const n = Array.isArray(value) ? value.length : 0;
    return `${n} image${n === 1 ? '' : 's'}`;
  }
  const text = value == null ? '' : String(value);
  switch (field) {
    case 'date':
      return formatDate(text);
    case 'timing':
      return TIMING_MAP[text] ?? text;
    case 'place':
      return PLACE_MAP[text] ?? text;
    case 'procedure_type':
      return PROC_MAP[text] ?? text;
    case 'role':
      return ROLE_MAP[text] ?? text;
    case 'op_time':
      return OPTIME_MAP[text] ?? text;
    case 'hn':
      return maskHn(text);
    default:
      return bulleted(text) || '(empty)';
  }
}

/** Telegram has no coloured text, so a change reads as struck-through old →
 *  new. Short values sit inline; multi-line ones stack to stay readable. */
function changeLine(field: string, before: unknown, after: unknown): string {
  const from = displayValue(field, before);
  const to = displayValue(field, after);
  const label = `<b>${esc(FIELD_LABELS[field] ?? field)}</b>`;
  const long = from.length + to.length > 60 || from.includes('\n') || to.includes('\n');
  return long
    ? `\n\n${label}\n<s>${esc(from)}</s>\n→ ${esc(to)}`
    : `\n\n${label}\n<s>${esc(from)}</s> → ${esc(to)}`;
}

/** Situation 2 — a saved case was edited. `previous` holds only the changed
 *  columns' prior values; `row` is the authoritative post-update row. Returns
 *  null when nothing actually changed, so an idle save sends no message. */
export function editedCaseMessage(
  row: CaseRow,
  previous: Record<string, unknown>,
  fellowName: string,
  institution: string | null,
): string | null {
  const fields = Object.keys(previous).filter(f => f in FIELD_LABELS);
  if (fields.length === 0) return null;

  const changes = fields
    .map(f => changeLine(f, previous[f], (row as unknown as Record<string, unknown>)[f]))
    .join('');

  return (
    `✏️ <b>Case edited</b>\n` +
    `${who(fellowName, institution)}\n` +
    `Case of ${esc(formatDate(row.date))} · HN <code>${esc(maskHn(row.hn))}</code>\n` +
    `${fields.length} field${fields.length === 1 ? '' : 's'} changed` +
    changes
  );
}

/** Situation 3 — an inbound LINE message. `fellowName` is null for a LINE
 *  account with no physician record, which is the common case in practice:
 *  anyone who finds the official account can message it, and that's precisely
 *  who the raw user id is needed for. */
export function chatMessage(
  lineUserId: string,
  text: string,
  fellowName: string | null,
  institution: string | null,
): string {
  const head = fellowName
    ? `💬 <b>Message from fellow</b>\n${who(fellowName, institution)}`
    : `💬 <b>Message from unregistered user</b>\nNo physician record for this LINE account`;

  return (
    `${head}\n` +
    `\n<b>LINE user ID</b>\n<code>${esc(lineUserId)}</code>\n` +
    `\n<blockquote>${esc(text)}</blockquote>`
  );
}
