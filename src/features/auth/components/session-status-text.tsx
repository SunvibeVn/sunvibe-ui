type SessionStatusTextProps = { text: string };

/** A one-line status (loading, leaving) announced to screen readers. */
export function SessionStatusText({ text }: SessionStatusTextProps) {
  return (
    <p role="status" className="py-10 text-center text-sm text-slate-500">
      {text}
    </p>
  );
}
