"use client";

import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Accessible name of the corner close button; the button is omitted when not given. */
  closeLabel?: string;
};

/**
 * Modal built on the native dialog element: showModal() gives the focus trap, inert page and top layer.
 * Controlled by `open`; Esc and a click on the backdrop call `onClose`. Focus returns to the opener on close.
 */
export function Dialog({ open, onClose, title, children, footer, closeLabel }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The browser may close the dialog without a cancel event (Esc without fresh user activation, a second Esc).
    // The listener is removed before our own close() below, so it only fires when the parent still thinks it is open.
    // The close event is queued as a task: the one our own close() below queues in a development double effect (Strict
    // Mode) fires after the next effect has opened the dialog again. A dialog that is open was not closed: ignore it.
    const handleNativeClose = () => {
      if (!dialog.open) onCloseRef.current();
    };
    dialog.addEventListener("close", handleNativeClose);
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.removeEventListener("close", handleNativeClose);
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Keep the state in the parent: let it decide to close instead of the browser closing behind its back.
    event.preventDefault();
    onClose();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/50"
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {closeLabel && (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="-m-1 rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </dialog>
  );
}
