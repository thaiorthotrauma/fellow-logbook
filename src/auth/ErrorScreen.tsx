interface ErrorScreenProps {
  message: string;
  onRetry: () => void;
}

export default function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-badge auth-badge-error">!</div>
        <div className="auth-title">Something went wrong</div>
        <div className="auth-body">{message}</div>
        <button type="button" className="btn-primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}
