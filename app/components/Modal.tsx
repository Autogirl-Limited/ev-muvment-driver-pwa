"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Spinner } from "./Ui";

/**
 * Base modal built on the native <dialog>: focus is trapped, Escape works, and it sits in the
 * top layer above everything else. Children only mount while open, so their state resets.
 */
export function Modal({
  open,
  onClose,
  dismissible = true,
  label,
  children,
  panelClassName,
}: {
  open: boolean;
  onClose: () => void;
  /** Set false while an action is running so the modal can't be dismissed mid-request. */
  dismissible?: boolean;
  label: string;
  children: ReactNode;
  panelClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <dialog
      aria-label={label}
      className="modal"
      ref={ref}
      onCancel={(event) => {
        event.preventDefault(); // we control closing through `open`
        if (dismissible) onClose();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose(); // tap on the backdrop
      }}
    >
      {open ? <div className={`modal-panel ${panelClassName ?? ""}`}>{children}</div> : null}
    </dialog>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  icon,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
}) {
  const titleId = useId();
  return (
    <Modal dismissible={!loading} label={title} open={open} onClose={onClose}>
      <div className="confirm">
        {icon ? <span className={`confirm-icon ${tone}`}>{icon}</span> : null}
        <h2 id={titleId}>{title}</h2>
        <p>{description}</p>
        <div className="confirm-actions">
          <button className={`primary-button ${tone === "danger" ? "danger" : ""}`} disabled={loading} type="button" onClick={onConfirm}>
            {loading ? <Spinner /> : null}
            {confirmLabel}
          </button>
          <button className="ghost-button" disabled={loading} type="button" onClick={onClose}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
