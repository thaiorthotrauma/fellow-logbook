// Loads Telegram's Mini App SDK on demand — only the Add Person screen needs
// it, so it's not part of the app's normal LIFF-based boot path or bundle.
export interface TelegramWebApp {
  ready(): void;
  expand(): void;
  initData: string;
  colorScheme: 'light' | 'dark';
  MainButton: {
    setText(text: string): void;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    disable(): void;
    enable(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

let loading: Promise<TelegramWebApp> | null = null;

/** Injects the SDK script once and resolves with the WebApp object. Outside
 *  Telegram's own client the script still loads and defines the object (so
 *  this never throws just from being opened in a plain browser), but
 *  MainButton has nothing real to show — see AddPersonMiniApp's initData
 *  check for how that case is actually handled. */
export function loadTelegramWebApp(): Promise<TelegramWebApp> {
  if (window.Telegram?.WebApp) return Promise.resolve(window.Telegram.WebApp);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.onload = () => {
      if (window.Telegram?.WebApp) resolve(window.Telegram.WebApp);
      else reject(new Error('Telegram WebApp SDK loaded but window.Telegram.WebApp is missing'));
    };
    script.onerror = () => reject(new Error('Failed to load the Telegram WebApp SDK'));
    document.head.appendChild(script);
  });
  return loading;
}
