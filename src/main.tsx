import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (bundled by Vite, no external CDN dependency).
// IBM Plex Sans covers Latin; IBM Plex Sans Thai supplies matching Thai
// glyphs (fellow name / institution) — the browser falls through to it
// per-character since IBM Plex Sans has no Thai coverage.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-sans-thai/400.css'
import '@fontsource/ibm-plex-sans-thai/500.css'
import '@fontsource/ibm-plex-sans-thai/700.css'
import './index.css'
import App from './App.tsx'
import AuthGate from './auth/AuthGate.tsx'
import AddPersonMiniApp from './admin/AddPersonMiniApp.tsx'
import { getAppView } from './lib/appView.ts'
import { installGlobalErrorReporting } from './lib/errorReport.ts'

// Catches what no `catch` block did — a render that threw, a promise nobody
// awaited — and forwards it to the admin Telegram chat. Installed before
// anything mounts, so an error during the very first render is still reported.
installGlobalErrorReporting()

// ?view=addperson is the Telegram Mini App admin form — opened from the
// bot's menu button, never from LINE. It has its own identity model
// (Telegram's signed initData, not LIFF/Supabase auth), so it's checked here,
// before AuthGate, rather than inside it: AuthGate's bootstrap() assumes
// every caller is inside LIFF and would refuse this one outright.
const root = getAppView() === 'addperson' ? <AddPersonMiniApp /> : (
  <AuthGate>
    <App />
  </AuthGate>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>{root}</StrictMode>,
)
