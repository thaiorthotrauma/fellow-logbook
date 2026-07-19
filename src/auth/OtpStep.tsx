import { useState } from 'react';

interface OtpStepProps {
  email: string;
  onSubmit: (code: string) => Promise<void>;
}

export default function OtpStep({ email, onSubmit }: OtpStepProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(code.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect or expired code. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-title">Enter Verification Code</div>
        <div className="auth-body">We sent a 6-digit code to {email}.</div>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="field-input"
          placeholder="123456"
          value={code}
          onChange={e => setCode(e.target.value)}
          autoFocus
          required
        />
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </form>
    </div>
  );
}
