import { useState } from 'react';

interface EmailStepProps {
  onSubmit: (email: string) => Promise<void>;
}

export default function EmailStep({ onSubmit }: EmailStepProps) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify that email. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <div className="auth-title">Verify Your Email</div>
        <div className="auth-body">
          Enter the email address registered with your fellowship program. We'll send a one-time code to confirm
          it's you.
        </div>
        <input
          type="email"
          className="field-input"
          placeholder="you@hospital.org"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoFocus
          required
        />
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Checking…' : 'Send Code'}
        </button>
      </form>
    </div>
  );
}
