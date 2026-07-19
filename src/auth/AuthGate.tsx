import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getLineIdToken, initLiff, liff } from '../lib/liff';
import EmailStep from './EmailStep';
import OtpStep from './OtpStep';
import RejectedScreen from './RejectedScreen';
import LoadingScreen from './LoadingScreen';
import ErrorScreen from './ErrorScreen';
import './auth.css';

type Stage = 'loading' | 'email' | 'otp' | 'rejected' | 'error' | 'authenticated';

interface CheckLineUserResponse {
  status: 'verified' | 'unlinked';
  email?: string;
  token_hash?: string;
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>('loading');
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap() {
    try {
      setStage('loading');

      const { data: existingSession } = await supabase.auth.getSession();

      await initLiff();
      if (!liff.isLoggedIn()) {
        liff.login();
        return; // page will redirect through LINE login and reload
      }

      const idToken = getLineIdToken();

      if (existingSession.session) {
        // Fast path: browser already holds a valid Supabase session. Trust it
        // and skip the round trip — check-line-user is only needed to
        // re-establish a session on a fresh device/webview.
        setStage('authenticated');
        return;
      }

      const { data, error } = await supabase.functions.invoke<CheckLineUserResponse>('check-line-user', {
        body: { id_token: idToken },
      });
      if (error) throw error;

      if (data?.status === 'verified' && data.email && data.token_hash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: data.email,
          token: data.token_hash,
          type: 'magiclink',
        });
        if (verifyError) throw verifyError;
        setStage('authenticated');
        return;
      }

      setStage('email');
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      setStage('error');
    }
  }

  async function handleEmailSubmit(submittedEmail: string) {
    const { data: allowed, error } = await supabase.rpc('is_email_allowed', { p_email: submittedEmail });
    if (error) throw error;

    if (!allowed) {
      setStage('rejected');
      return;
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: submittedEmail,
      options: { shouldCreateUser: true },
    });
    if (otpError) throw otpError;

    setEmail(submittedEmail);
    setStage('otp');
  }

  async function handleOtpSubmit(code: string) {
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (verifyError) throw verifyError;

    const { error: claimError } = await supabase.rpc('claim_physician_row');
    if (claimError) throw claimError;

    const idToken = getLineIdToken();
    const { error: linkError } = await supabase.functions.invoke('link-line-user', {
      body: { id_token: idToken },
    });
    if (linkError) throw linkError;

    setStage('authenticated');
  }

  if (stage === 'loading') return <LoadingScreen />;
  if (stage === 'error') return <ErrorScreen message={errorMessage} onRetry={bootstrap} />;
  if (stage === 'rejected') return <RejectedScreen />;
  if (stage === 'email') return <EmailStep onSubmit={handleEmailSubmit} />;
  if (stage === 'otp') return <OtpStep email={email} onSubmit={handleOtpSubmit} />;

  return <>{children}</>;
}
