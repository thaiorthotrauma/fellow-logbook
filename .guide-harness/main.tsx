// Screenshot harness for the tutorial usage guides: renders the real app (and
// the real auth screens) against stubbed LIFF/Supabase modules, so the guide
// figures are the actual UI at a mobile phone viewport rather than mockups.
//
// Not part of the app bundle — served only by vite.guide.config.ts.
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans-thai/400.css';
import '@fontsource/ibm-plex-sans-thai/500.css';
import '@fontsource/ibm-plex-sans-thai/700.css';
import '../src/index.css';
// AuthGate normally pulls these in; the harness renders the auth screens
// directly, so it has to import their stylesheets itself.
import '../src/App.css';
import '../src/auth/auth.css';
import App from '../src/App';
import DeviceGateScreen from '../src/auth/DeviceGateScreen';
import EmailStep from '../src/auth/EmailStep';
import OtpStep from '../src/auth/OtpStep';
import RejectedScreen from '../src/auth/RejectedScreen';

const screen = new URLSearchParams(window.location.search).get('screen') ?? 'app';

// Auth screens are rendered directly rather than through AuthGate: the guide
// needs each state on demand, and AuthGate only reaches them by way of a real
// LINE identity and a real whitelist round trip.
const never = () => new Promise<void>(() => {});

function pick() {
  switch (screen) {
    case 'email':
      return <EmailStep onSubmit={never} />;
    case 'otp':
      return <OtpStep email="somchai.j@example.ac.th" onSubmit={never} />;
    case 'rejected':
      return <RejectedScreen />;
    case 'gate-browser':
      return <DeviceGateScreen reason="not-liff" />;
    case 'gate-desktop':
      return <DeviceGateScreen reason="desktop" />;
    default:
      return <App />;
  }
}

createRoot(document.getElementById('root')!).render(pick());
