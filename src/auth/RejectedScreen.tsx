export default function RejectedScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-badge auth-badge-error">✕</div>
        <div className="auth-title">Email Not Found</div>
        <div className="auth-body">
          This email isn't on the approved fellow/physician list for this logbook. If you believe this is a
          mistake, contact the program administrator to be added.
        </div>
      </div>
    </div>
  );
}
