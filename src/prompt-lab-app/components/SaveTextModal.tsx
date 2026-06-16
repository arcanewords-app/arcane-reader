import { useState } from 'preact/hooks';
import { PlModal } from './PlModal';

interface SaveTextModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}

export function SaveTextModal({ open, onClose, onSave }: SaveTextModalProps) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setTitle('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PlModal
      open={open}
      title="Save text"
      onClose={onClose}
      footer={
        <div class="pl-row">
          <button type="button" class="pl-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" class="pl-btn" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <label class="pl-field">
        <span class="pl-label">Title</span>
        <input
          class="pl-input pl-input--full"
          type="text"
          value={title}
          onInput={(e) => setTitle(e.currentTarget.value)}
          placeholder="Chapter sample, test paragraph…"
        />
      </label>
      {error ? <p class="pl-error">{error}</p> : null}
    </PlModal>
  );
}
