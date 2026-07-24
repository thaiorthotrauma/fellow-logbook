import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getLineIdToken, initLiff, isLikelyDesktop, liff } from '../lib/liff';
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
      if (isLikelyDesktop()) {
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

      if (data?.status === 'verified' && data.redeem_token) {
        // redeem_token is the *hashed* token from the server's generateLink
        // call, so it must go in `token_hash` (not `token`, which is for a
        // raw emailed code). `type: 'magiclink'` is just Supabase's label for
        // this redemption — no email is sent. This turns the server-minted
        // token into a real, auto-refreshing session for a fellow we already
        // verified owns this LINE identity.
        const { error: redeemError } = await supabase.auth.verifyOtp({
          token_hash: data.redeem_token,
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
    if (verifyError) throw verifyError; // wrong/expired code — OtpStep shows it and lets them retry

    // From here the user is verified and holds a session, so never bounce them
    // back to re-enter a now-consumed code. Linking their physician row and
    // LINE identity is best-effort: if it fails (e.g. transient), let them in
    // anyway — it self-heals on the next re-authentication.
    try {
      const { error: claimError } = await supabase.rpc('claim_physician_row');
      if (claimError) throw claimError;

      const idToken = getLineIdToken();
      const { error: linkError } = await supabase.functions.invoke('link-line-user', {
        body: { id_token: idToken },
      });
      if (linkError) throw linkError;
    } catch (err) {
      console.error('Post-verification linking failed (continuing):', err);
    }

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
