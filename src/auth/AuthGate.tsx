import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getLineIdToken, initLiff, liff } from '../lib/liff';
import EmailStep from './EmailStep';
import OtpStep from './OtpStep';
import RejectedScreen from './RejectedScreen';
import LoadingScreen from './LoadingScreen';
import ErrorScreen from './ErrorScreen';
import DeviceGateScreen from './DeviceGateScreen';
import './auth.css';

type Stage = 'loading' | 'blocked-not-liff' | 'blocked-desktop' | 'email' | 'otp' | 'rejected' | 'error' | 'authenticated';

interface CheckLineUserResponse {
  status: 'verified' | 'unlinked';
  email?: string;
  redeem_token?: string;
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

      await initLiff();

      // Hard gate, checked before any LINE login attempt: this app is only
      // ever allowed to run inside LINE's own in-app browser, on a phone or
      // tablet. Anything else — an external browser, a desktop LINE client,
      // a plain link opened in Safari/Chrome — is refused outright.
      if (!liff.isInClient()) {
        setStage('blocked-not-liff');
        return;
      }
      if (liff.getOS() === 'web') {
        setStage('blocked-desktop');
        return;
      }

      const { data: existingSession } = await supabase.auth.getSession();

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

      if (data?.status === 'verified' && data.email && data.redeem_token) {
        // `type: 'magiclink'` here is just the label Supabase's SDK uses for
        // this redemption — no email is involved. This is purely how the
        // token check-line-user generated server-side gets turned into a
        // real, auto-refreshing session for a physician we already verified.
        const { error: redeemError } = await supabase.auth.verifyOtp({
          email: data.email,
          token: data.redeem_token,
          type: 'magiclink',
        });
        if (redeemError) throw redeemError;
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
  if (stage === 'blocked-not-liff') return <DeviceGateScreen reason="not-liff" />;
  if (stage === 'blocked-desktop') return <DeviceGateScreen reason="desktop" />;
  if (stage === 'rejected') return <RejectedScreen />;
  if (stage === 'email') return <EmailStep onSubmit={handleEmailSubmit} />;
  if (stage === 'otp') return <OtpStep email={email} onSubmit={handleOtpSubmit} />;

  return <>{children}</>;
}
