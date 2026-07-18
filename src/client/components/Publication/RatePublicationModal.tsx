import { useState, useEffect, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Icon } from '../ui';
import './RatePublicationModal.css';

interface RatePublicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialScore?: number | null;
  onSave: (score: number) => Promise<void>;
  onRemove?: () => Promise<void>;
}

export function RatePublicationModal({
  isOpen,
  onClose,
  initialScore,
  onSave,
  onRemove,
}: RatePublicationModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<number | null>(initialScore ?? null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelected(initialScore ?? null);
      setHovered(null);
      setError(null);
    }
  }, [isOpen, initialScore]);

  const displayScore = hovered ?? selected;
  const scoreLabelKey = displayScore != null ? (`rating.scoreLabel${displayScore}` as const) : null;

  const handleSave = useCallback(async () => {
    if (selected == null) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(selected);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.retry'));
    } finally {
      setSaving(false);
    }
  }, [selected, onSave, onClose, t]);

  const handleRemove = useCallback(async () => {
    if (!onRemove) return;
    setSaving(true);
    setError(null);
    try {
      await onRemove();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.retry'));
    } finally {
      setSaving(false);
    }
  }, [onRemove, onClose, t]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !saving && onClose()}
      title={t('rating.rateTitle')}
      footer={
        <div class="publication-rating-modal-footer">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={selected == null}
            loading={saving}
          >
            {t('rating.save')}
          </Button>
        </div>
      }
    >
      <div class="publication-rating-input">
        <div
          class="publication-rating-input-stars"
          aria-label={t('rating.rateTitle')}
          onMouseLeave={() => setHovered(null)}
        >
          {[1, 2, 3, 4, 5].map((value) => {
            const active = displayScore != null && value <= displayScore;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected === value}
                class={`publication-rating-input-btn${active ? ' is-active' : ''}`}
                onMouseEnter={() => setHovered(value)}
                onClick={() => setSelected(value)}
                disabled={saving}
              >
                <Icon name={active ? 'star' : 'star_border'} size="lg" />
              </button>
            );
          })}
        </div>
        {scoreLabelKey && <p class="publication-rating-input-label">{t(scoreLabelKey)}</p>}
        {initialScore != null && onRemove && (
          <button
            type="button"
            class="publication-rating-input-remove"
            onClick={handleRemove}
            disabled={saving}
          >
            {t('rating.remove')}
          </button>
        )}
        {error && <p class="publication-rating-input-error">{error}</p>}
      </div>
    </Modal>
  );
}
