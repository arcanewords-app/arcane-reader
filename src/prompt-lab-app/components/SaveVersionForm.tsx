import { useState } from 'preact/hooks';

interface SaveVersionFormProps {
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function SaveVersionForm({ onSave, onCancel }: SaveVersionFormProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form class="pl-inline-form" onSubmit={(e) => void handleSubmit(e)}>
      <input
        class="pl-input"
        type="text"
        placeholder="Version name"
        value={name}
        onInput={(e) => setName(e.currentTarget.value)}
      />
      <button type="submit" class="pl-btn" disabled={saving}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" class="pl-btn secondary" onClick={onCancel}>
        Cancel
      </button>
      {error ? <p class="pl-error">{error}</p> : null}
    </form>
  );
}
