export default function Toast({ message }) {
  return (
    <div className={`toast ${message ? 'show' : ''}`.trim()} id="toast" role="status" aria-live="polite">
      {message}
    </div>
  );
}
