type Reason = 'not-liff' | 'desktop';

const COPY: Record<Reason, { title: string; body: string }> = {
  'not-liff': {
    title: 'Open This in the LINE App',
    body: "This logbook only works inside LINE's in-app browser. Open it from a LINE chat or the LIFF link — not an external browser like Safari or Chrome.",
  },
  desktop: {
    title: 'Mobile & Tablet Only',
    body: 'This logbook is designed for use on mobile phones and tablets in the operating room and ward. Please open it on your phone through LINE, not a desktop.',
  },
};

export default function DeviceGateScreen({ reason }: { reason: Reason }) {
  const { title, body } = COPY[reason];
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-badge auth-badge-error">!</div>
        <div className="auth-title">{title}</div>
        <div className="auth-body">{body}</div>
      </div>
    </div>
  );
}
