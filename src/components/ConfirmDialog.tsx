import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A non-blocking, accessible replacement for window.confirm().
 * Renders as a centred modal with Framer Motion transitions.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button when the dialog opens for keyboard accessibility.
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  // Close on Escape key.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop fade show d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 3000 }}
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            className="modal fade show d-flex align-items-center justify-content-center"
            style={{ zIndex: 3001 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
          >
            <div className="modal-dialog modal-dialog-centered px-4 w-100" style={{ maxWidth: '400px' }}>
              <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden">
                <div className="modal-body p-4 text-center">
                  <h5 id="confirm-dialog-title" className="fw-black mb-2 text-dark">{title}</h5>
                  <p id="confirm-dialog-message" className="text-muted small mb-4 mb-0">{message}</p>
                </div>
                <div className="modal-footer border-0 px-4 pb-4 pt-0 d-flex gap-2">
                  <button
                    className="btn btn-light flex-grow-1 fw-bold py-3 rounded-3"
                    onClick={onCancel}
                  >
                    {cancelLabel}
                  </button>
                  <button
                    ref={confirmRef}
                    className={`btn btn-${variant} flex-grow-1 fw-bold py-3 rounded-3 shadow-sm`}
                    onClick={onConfirm}
                  >
                    {confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
