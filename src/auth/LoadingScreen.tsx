export default function LoadingScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-spinner" aria-hidden="true" />
        <div className="auth-title">Loading…</div>
      </div>
    </div>
  );
}
