import React from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" id="confirm-modal-overlay">
      <div className="modal-content" id="confirm-modal-content">
        <h3 className="modal-title" style={{ color: isDanger ? 'var(--accent-red)' : 'var(--text-primary)' }}>
          {title}
        </h3>
        <p className="modal-body">{message}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            id="confirm-cancel-btn"
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${isDanger ? 'btn-danger' : 'btn-gold'}`}
            onClick={onConfirm}
            id="confirm-ok-btn"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
