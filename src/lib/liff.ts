import liff from '@line/liff';

const liffId = import.meta.env.VITE_LIFF_ID;

let initPromise: Promise<void> | null = null;

export function initLiff(): Promise<void> {
  if (!liffId) {
    return Promise.reject(new Error('VITE_LIFF_ID must be set (see .env.example)'));
  }
  if (!initPromise) {
    initPromise = liff.init({ liffId });
  }
  return initPromise;
}

export function getLineIdToken(): string {
  const token = liff.getIDToken();
  if (!token) throw new Error('LIFF did not return an ID token — is the user logged into LINE?');
  return token;
}

export { liff };
