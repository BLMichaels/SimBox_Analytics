type Props = {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md border border-line bg-card p-5 shadow-lg"
      >
        <h2 id="confirm-title" className="font-serif text-xl text-ink">
          {title}
        </h2>
        <p className="mt-3 text-sm text-ink-soft">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="border border-line px-3 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="bg-danger px-3 py-2 text-sm text-card"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
