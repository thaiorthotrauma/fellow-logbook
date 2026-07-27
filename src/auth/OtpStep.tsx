import { useEffect, useRef, useState } from 'react';
import OtpInput from './OtpInput';

const CODE_LENGTH = 6;

interface OtpStepProps {
  email: string;
  onSubmit: (code: string) => Promise<void>;
}

export default function OtpStep({ email, onSubmit }: OtpStepProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Tracks in-flight submission across renders. Using a ref (not `busy`
  // state) keeps it out of the effect's dependency array — `setBusy(true)`
  // below re-renders the component, and if `busy` were a dependency that
  // re-render would rerun this effect, tearing down (and marking
  // `cancelled`) the very submission it just started.
  const submittingRef = useRef(false);

  useEffect(() => {
    // Auto-submit only a complete, all-digit code. Guarding on the digit
    // pattern (not just length) avoids firing on a value that reached length 6
    // with a gap/space from filling the boxes out of order.
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code) || submittingRef.current) return;

    let cancelled = false;
    submittingRef.current = true;
    setBusy(true);
    setError('');
    onSubmit(code)
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Incorrect or expired code. Please try again.');
        setCode('');
      })
      .finally(() => {
        submittingRef.current = false;
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code, onSubmit]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-title">Enter Verification Code</div>
        <div className="auth-body">We sent a 6-digit code to {email}.</div>
        <OtpInput value={code} onChange={setCode} disabled={busy} />
        {busy && <div className="auth-body">Verifying…</div>}
        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  );
}
