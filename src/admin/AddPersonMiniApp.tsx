import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { functionErrorMessage } from '../lib/errors';
import { loadTelegramWebApp, type TelegramWebApp } from '../lib/telegramWebApp';
import { extractLineUserId } from '../lib/lineIdExtract';
import { INSTITUTIONS } from '../data';
import './addPerson.css';
import { reportError } from '../lib/errorReport';

type Role = 'fellow' | 'staff';

interface AddPersonResponse {
  ok: boolean;
  error?: string;
  existing?: { full_name: string; institution: string | null };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAMPLE_MESSAGE = `💬 Message from unregistered user
No fellow record for this LINE account

LINE user ID
Ud7b3f66b43705f50c2a8cdd268f0587b

[sent a sticker]`;

/** Adds a fellow or staff member from inside Telegram — opened via the bot's
 *  menu button (?view=addperson), never from LINE. Authenticity comes from
 *  Telegram's signed `initData`, not a Supabase session: see
 *  supabase/functions/telegram-add-person and _shared/telegramInitData.ts. */
export default function AddPersonMiniApp() {
  const [status, setStatus] = useState<'loading' | 'blocked' | 'ready'>('loading');
  const [loadError, setLoadError] = useState('');
  const [role, setRole] = useState<Role>('fellow');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [institution, setInstitution] = useState('');
  const [email, setEmail] = useState('');
  const [lineRaw, setLineRaw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const tgRef = useRef<TelegramWebApp | null>(null);

  const lineUserId = extractLineUserId(lineRaw);
  const emailTrimmed = email.trim();
  const emailTouched = emailTrimmed.length > 0;
  const emailValid = EMAIL_RE.test(emailTrimmed);

  const canSubmit =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    institution.trim() !== '' &&
    (role === 'fellow' ? emailValid : lineUserId !== null) &&
    !submitting;

  useEffect(() => {
    loadTelegramWebApp()
      .then(tg => {
        tgRef.current = tg;
        tg.ready();
        tg.expand();
        // A plain browser (not Telegram's own client) still loads the SDK
        // script, but initData is always empty outside a real launch — that's
        // the one reliable signal this wasn't opened the intended way.
        setStatus(tg.initData ? 'ready' : 'blocked');
      })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load Telegram.');
        setStatus('blocked');
      });
  }, []);

  // Holds the latest handleSubmit so the MainButton listener below always
  // runs with current form values without needing to re-attach on every
  // keystroke (it only depends on status/role/canSubmit).
  const submitRef = useRef(() => Promise.resolve());
  submitRef.current = handleSubmit;

  // The native MainButton belongs to Telegram's chrome, not this page, so the
  // submit action is wired to it rather than an HTML button.
  useEffect(() => {
    const tg = tgRef.current;
    if (!tg || status !== 'ready') return;
    tg.MainButton.setText(role === 'fellow' ? 'Add Fellow' : 'Add Staff');
    if (canSubmit) tg.MainButton.enable();
    else tg.MainButton.disable();
    tg.MainButton.show();
    const handler = () => void submitRef.current();
    tg.MainButton.onClick(handler);
    return () => tg.MainButton.offClick(handler);
  }, [status, role, canSubmit]);

  async function handleSubmit() {
    if (!canSubmit || !tgRef.current) return;
    setSubmitting(true);
    setBanner(null);
    tgRef.current.MainButton.showProgress();
    try {
      const { data, error } = await supabase.functions.invoke<AddPersonResponse>('telegram-add-person', {
        body: {
          initData: tgRef.current.initData,
          role,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          institution: institution.trim(),
          ...(role === 'fellow' ? { email: emailTrimmed } : { lineUserId }),
        },
      });
      if (error) throw new Error(await functionErrorMessage(error));

      if (data?.ok) {
        setBanner({
          kind: 'ok',
          text: `${firstName.trim()} ${lastName.trim()} added as ${role === 'fellow' ? 'fellow' : 'staff'}.`,
        });
        setFirstName('');
        setLastName('');
        setInstitution('');
        setEmail('');
        setLineRaw('');
      } else {
        setBanner({ kind: 'error', text: describeAddError(data) });
      }
    } catch (err) {
      // The Mini App runs inside Telegram with no Supabase session, so this
      // reports through the unverified path — still worth having, since the
      // only other trace is a banner the admin has already dismissed.
      reportError(err, {
        component: 'Add Person',
        where: 'AddPersonMiniApp submit → telegram-add-person',
      });
      setBanner({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setSubmitting(false);
      tgRef.current?.MainButton.hideProgress();
    }
  }

  if (status === 'loading') return null;

  if (status === 'blocked') {
    return (
      <div className="addperson-blocked">
        <strong>Open this from the bot's menu</strong>
        <p>{loadError || "This form only works when opened inside Telegram, from the bot's menu button."}</p>
      </div>
    );
  }

  return (
    <div className="addperson">
      <div className="role-toggle" role="group" aria-label="Person type">
        <button
          type="button"
          className="fellow"
          aria-pressed={role === 'fellow'}
          onClick={() => setRole('fellow')}
        >
          Fellow
        </button>
        <button type="button" className="staff" aria-pressed={role === 'staff'} onClick={() => setRole('staff')}>
          Staff
        </button>
      </div>

      {banner && <div className={`addperson-banner ${banner.kind}`}>{banner.text}</div>}

      <div className="field-group">
        <div>
          <label htmlFor="fFirst">First name</label>
          <input id="fFirst" type="text" value={firstName} onChange={e => setFirstName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="fLast">Last name</label>
          <input id="fLast" type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="fInst">Institution</label>
          <select id="fInst" value={institution} onChange={e => setInstitution(e.target.value)}>
            <option value="" disabled>
              Select institution…
            </option>
            {INSTITUTIONS.map(inst => (
              <option key={inst} value={inst}>
                {inst}
              </option>
            ))}
          </select>
        </div>

        {role === 'fellow' ? (
          <div>
            <label htmlFor="fEmail">Email</label>
            <input
              id="fEmail"
              type="email"
              value={email}
              className={emailTouched && !emailValid ? 'invalid' : ''}
              onChange={e => setEmail(e.target.value)}
            />
            {emailTouched && !emailValid && <div className="help error">Missing a domain ending, like .com</div>}
          </div>
        ) : (
          <div>
            <div className="paste-row">
              <label style={{ marginBottom: 0 }}>LINE user ID</label>
              <button type="button" className="sample-btn" onClick={() => setLineRaw(SAMPLE_MESSAGE)}>
                Use sample message
              </button>
            </div>
            <textarea
              placeholder={'Paste the forwarded "unregistered user" message here…'}
              value={lineRaw}
              onChange={e => setLineRaw(e.target.value)}
            />
            <div className="extract-result">
              {lineUserId ? (
                <span className="extract-chip">
                  <span className="check">✓</span>
                  <span>{lineUserId}</span>
                </span>
              ) : (
                <span>No ID detected yet — paste the forwarded message above.</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="addperson-footnote">
        Only Telegram admins can submit — verified from your Telegram identity, not a password.
      </div>
    </div>
  );
}

function describeAddError(data: AddPersonResponse | null | undefined): string {
  if (data?.error === 'duplicate' && data.existing) {
    const institution = data.existing.institution ? ` (${data.existing.institution})` : '';
    return `Already registered to ${data.existing.full_name}${institution}.`;
  }
  switch (data?.error) {
    case 'not-admin':
      return "You're not authorized to add people.";
    case 'invalid-email':
      return 'That email address looks incomplete.';
    case 'missing-fields':
      return 'Please fill in every field.';
    case 'invalid-initdata':
      return 'Could not verify this session — reopen from Telegram.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
