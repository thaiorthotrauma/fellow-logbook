/** The app's two special entry points, reached via the per-user rich menu
 *  shown only to verified staff (see line-oa/README.md). Everything else
 *  (chat, the default rich menu, a bookmarked link) opens with no `view`
 *  param and falls through to the normal fellow/staff auto-detection.
 *
 *  There is no router — this is the one place that reads the URL, checked
 *  once at boot by AuthGate and again by App. */
export type AppView = 'staff' | 'demo' | null;

export function getAppView(search: string = window.location.search): AppView {
  const v = new URLSearchParams(search).get('view');
  return v === 'staff' || v === 'demo' ? v : null;
}
