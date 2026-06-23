import { useState, useEffect, useMemo, useCallback } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import type { ProjectSearchMatch } from '../../types';
import type { AiReplacePresetId } from '../../../shared/aiReplacePresets';
import {
  AI_REPLACE_DETAIL_MAX_CHARS,
  AI_REPLACE_PRESET_IDS,
} from '../../../shared/aiReplacePresets';
import { estimateAiReplaceTokens } from '../../../shared/aiReplaceEstimate';
import { api, ApiError } from '../../api/client';
import { useTokenLimitCheck } from '../../hooks/useTokenLimitCheck';
import { useTokenUsageContext } from '../../contexts/TokenUsageContext';
import { Modal, Button } from '../ui';
import { TokenLimitWarning } from '../TokenUsage/TokenLimitWarning';
import type { ReplacePreviewItem } from './ReplacePreviewModal';
import './AiReplaceSetupModal.css';

interface AiReplaceSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  find: string;
  replaceHint: string;
  selectedMatches: ProjectSearchMatch[];
  onPreview: (items: ReplacePreviewItem[], selectedCount: number) => void;
}

function defaultPreset(replaceHint: string): AiReplacePresetId {
  return replaceHint.trim() ? 'name_declension' : 'minimal_fix';
}

function formatAiReplaceError(err: unknown, t: (key: string, opts?: object) => string): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : 'AI replace failed';
  }
  const data = err.data as { paragraphId?: string } | undefined;
  if (data?.paragraphId) {
    return t('searchReplace.aiReplaceErrorWithParagraph', {
      message: err.message,
      id: data.paragraphId.slice(0, 8),
    });
  }
  return err.message;
}

export function AiReplaceSetupModal({
  isOpen,
  onClose,
  projectId,
  find,
  replaceHint,
  selectedMatches,
  onPreview,
}: AiReplaceSetupModalProps) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<AiReplacePresetId>(() => defaultPreset(replaceHint));
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { usage: tokenUsage } = useTokenUsageContext();
  const { checkBeforeTranslate, warningState, closeWarning, confirmAndProceed } =
    useTokenLimitCheck();

  const totalChars = useMemo(
    () => selectedMatches.reduce((sum, m) => sum + m.fullText.length, 0),
    [selectedMatches]
  );
  const estimatedTokens = useMemo(
    () => estimateAiReplaceTokens(totalChars, selectedMatches.length),
    [totalChars, selectedMatches.length]
  );

  useEffect(() => {
    if (isOpen) {
      setPreset(defaultPreset(replaceHint));
      setDetail('');
      setError(null);
    }
  }, [isOpen, replaceHint]);

  const runAiReplace = useCallback(async () => {
    if (selectedMatches.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.aiReplaceInProject(projectId, {
        find,
        replaceHint: replaceHint.trim() || undefined,
        preset,
        detail: detail.trim() || undefined,
        paragraphs: selectedMatches.map((m) => ({
          chapterId: m.chapterId,
          paragraphId: m.paragraphId,
        })),
      });

      const items: ReplacePreviewItem[] = result.items.map((item) => ({
        paragraphId: item.paragraphId,
        paragraphIndex: item.paragraphIndex,
        chapterId: item.chapterId,
        chapterNumber: item.chapterNumber,
        before: item.before,
        after: item.after,
        find,
        source: 'ai',
      }));

      onPreview(items, selectedMatches.length);
      onClose();
    } catch (err) {
      setError(formatAiReplaceError(err, t));
    } finally {
      setLoading(false);
    }
  }, [selectedMatches, projectId, find, replaceHint, preset, detail, onPreview, onClose, t]);

  const handleRun = () => {
    if (selectedMatches.length === 0) return;
    checkBeforeTranslate(estimatedTokens, () => void runAiReplace());
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={loading ? () => {} : onClose}
        title={t('searchReplace.aiReplaceSetupTitle', 'Smart replace')}
        size="medium"
        className="ai-replace-setup-modal nested"
        closeOnBackdropClick={false}
        preventClose={loading}
        closeButtonDisabled={loading}
        footer={
          <div class="ai-replace-setup-footer">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleRun} loading={loading} disabled={loading}>
              {t('searchReplace.aiReplaceRun', 'Generate preview')}
            </Button>
          </div>
        }
      >
        <div class="ai-replace-setup-body">
          <p class="ai-replace-setup-summary">
            {t('searchReplace.aiReplaceSelectedCount', {
              count: selectedMatches.length,
              find,
            })}
          </p>

          {estimatedTokens > 0 && (
            <div class="ai-replace-setup-estimate">
              <span class="ai-replace-setup-tokens">
                {t('searchReplace.aiReplaceEstimatedTokens', {
                  tokens: estimatedTokens.toLocaleString(),
                })}
              </span>
              <p class="ai-replace-setup-hint">{t('searchReplace.aiReplaceEstimatedHint')}</p>
            </div>
          )}

          <p class="ai-replace-setup-hint ai-replace-setup-coverage-hint">
            {t('searchReplace.aiReplaceCoverageHint')}
          </p>

          <div class="form-group">
            <label class="ai-replace-setup-label" for="ai-replace-preset">
              {t('searchReplace.aiReplacePresetLabel', 'Task')}
            </label>
            <select
              id="ai-replace-preset"
              class="form-input"
              value={preset}
              onChange={(e) =>
                setPreset((e.target as HTMLSelectElement).value as AiReplacePresetId)
              }
              disabled={loading}
            >
              {AI_REPLACE_PRESET_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`searchReplace.aiPreset.${id}`)}
                </option>
              ))}
            </select>
            <p class="ai-replace-setup-hint">{t(`searchReplace.aiPresetHint.${preset}`)}</p>
          </div>

          {replaceHint.trim() && (
            <p class="ai-replace-setup-target">
              {t('searchReplace.aiReplaceTargetForm', { value: replaceHint.trim() })}
            </p>
          )}

          <div class="form-group" style={{ marginBottom: 0 }}>
            <label class="ai-replace-setup-label" for="ai-replace-detail">
              {t('searchReplace.aiReplaceDetailLabel', 'Note (optional)')}
            </label>
            <textarea
              id="ai-replace-detail"
              class="form-input ai-replace-detail-input"
              rows={3}
              maxlength={AI_REPLACE_DETAIL_MAX_CHARS}
              value={detail}
              onInput={(e) => setDetail((e.target as HTMLTextAreaElement).value)}
              placeholder={t('searchReplace.aiReplaceDetailPlaceholder', 'Short clarification…')}
              disabled={loading}
            />
            <span class="ai-replace-detail-counter">
              {detail.length}/{AI_REPLACE_DETAIL_MAX_CHARS}
            </span>
          </div>

          {error && <div class="ai-replace-setup-error">{error}</div>}
        </div>
      </Modal>

      {tokenUsage && warningState.isOpen && (
        <TokenLimitWarning
          isOpen={warningState.isOpen}
          onClose={closeWarning}
          onConfirm={confirmAndProceed}
          usage={tokenUsage}
          estimatedTokens={warningState.estimatedTokens}
        />
      )}
    </>
  );
}
