"use client";
import { useEffect } from 'react';

export interface DeleteConfirmModalProps {
  isOpen: boolean;
  gameDate: string; // display-friendly string
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({ isOpen, gameDate, onCancel, onConfirm }: DeleteConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative z-10 rounded-lg border border-border bg-surface p-6 shadow-xl max-w-sm w-full mx-4">
        <h2 id="delete-modal-title" className="text-lg font-bold text-foreground mb-2">
          Delete game from {gameDate}?
        </h2>
        <p className="text-sm text-muted mb-4">This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-border text-foreground hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-md bg-red-600 text-white font-medium hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
