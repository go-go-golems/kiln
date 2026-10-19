import { useEffect, useRef } from 'react';
import { Button } from '@/components/atoms/Button';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import './ConfirmDialog.css';

/** Native <dialog> so focus trapping and Escape work without extra code. */
export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'primary' | 'danger';
}> = ({ open, title, body, confirmLabel, onConfirm, onCancel, tone = 'primary' }) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="confirm" onCancel={(e) => (e.preventDefault(), onCancel())} aria-labelledby="confirm-title">
      <Eyebrow tone="warn">Confirm</Eyebrow>
      <h2 id="confirm-title">{title}</h2>
      <div className="confirm__body">{body}</div>
      <div className="confirm__actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
};
