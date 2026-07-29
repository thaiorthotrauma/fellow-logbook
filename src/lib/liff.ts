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

/** The LINE user id (the ID token's `sub` claim) of whoever is currently
 *  logged into LIFF, or null if not logged in / not yet decoded. Read
 *  straight from LIFF's own decoded token — no server round trip — since
 *  it's only ever used for a client-side UI gate (see DEMO_FULL_ACCESS_LINE_USER_ID),
 *  never to authorize access to real data. */
export function getLineUserId(): string | null {
  return liff.getDecodedIDToken()?.sub ?? null;
}

/** The one LINE user allowed to use every function (log/edit/delete a case,
 *  export a PDF) in the otherwise read-only Logbook Demo (`?view=demo`) —
 *  the staff admin seeded in supabase/seed_staff.sql, so they can exercise
 *  the full flow without opening that up to everyone the rich menu's
 *  "Logbook Demo" button reaches. */
export const DEMO_FULL_ACCESS_LINE_USER_ID = 'U1f7800c1ec874bb896bb11598c5ec49e';

// Since iPadOS 13, Safari (and any embedded WebView that doesn't override its
// user agent, which includes LINE's in-app browser) reports itself as a Mac
// by default — the string "iPad" no longer appears. liff.getOS() detects OS
// purely from that user agent, so it misreads a real iPad as desktop "web".
// A genuine Mac has no touchscreen; an iPad (even while UA-lying as one)
// reports multiple touch points. This distinguishes the two so a real iPad
// isn't wrongly treated as a desktop.
export function isLikelyDesktop(): boolean {
  if (liff.getOS() !== 'web') return false;
  return navigator.maxTouchPoints <= 1;
}

export { liff };
