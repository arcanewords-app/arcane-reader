import { useState } from 'preact/hooks';
import type { LabEvaluationPreview } from '../api/client.js';
import { PlChip } from './PlChip.js';
import { PlModal } from './PlModal.js';

export type EvaluationPromptTab = 'system' | 'user';

interface Props {
  open: boolean;
  onClose: () => void;
  preview: LabEvaluationPreview | null;
  loading?: boolean;
  error?: string | null;
}

export function EvaluationPromptModal({ open, onClose, preview, loading, error }: Props) {
  const [tab, setTab] = useState<EvaluationPromptTab>('system');
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const activeText = tab === 'system' ? (preview?.systemPrompt ?? '') : (preview?.userPrompt ?? '');
  const lineCount = activeText ? activeText.split('\n').length : 0;
  const charCount = activeText.length;

  const handleCopy = async () => {
    if (!activeText) return;
    try {
      await navigator.clipboard.writeText(activeText);
      setCopyStatus('Copied');
      setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus(null), 2000);
    }
  };

  const footer = (
    <div class="pl-eval-prompt-footer">
      {preview ? (
        <div class="pl-row pl-eval-prompt-stats">
          <PlChip
            variant={preview.compareMode === 'compare_outputs' ? 'model' : 'neutral'}
            label={preview.compareMode}
          />
          <span class="pl-muted">
            source {preview.stats.sourceChars} · left {preview.stats.leftChars} · right{' '}
            {preview.stats.rightChars} · glossary {preview.stats.glossaryChars} chars
          </span>
        </div>
      ) : null}
      <div class="pl-row">
        <span class="pl-muted">
          {lineCount} lines · {charCount} chars
          {copyStatus ? ` · ${copyStatus}` : ''}
        </span>
        <button
          type="button"
          class="pl-btn secondary"
          disabled={!activeText}
          onClick={() => void handleCopy()}
        >
          Copy
        </button>
        <button type="button" class="pl-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );

  return (
    <PlModal
      open={open}
      title="Evaluation prompt"
      onClose={onClose}
      size="fullscreen"
      footer={footer}
    >
      <div class="pl-eval-prompt-body">
        {loading ? <p class="pl-muted">Building prompt…</p> : null}
        {error ? <p class="pl-error">{error}</p> : null}
        {preview ? (
          <>
            <div class="pl-prompt-editor-tabs">
              <button
                type="button"
                class={`pl-tab-inline${tab === 'system' ? ' active' : ''}`}
                onClick={() => setTab('system')}
              >
                System
              </button>
              <button
                type="button"
                class={`pl-tab-inline${tab === 'user' ? ' active' : ''}`}
                onClick={() => setTab('user')}
              >
                User
              </button>
            </div>
            <textarea class="pl-textarea pl-textarea--editor" readOnly value={activeText} />
          </>
        ) : null}
        {!preview && !loading && !error ? (
          <p class="pl-muted">Select left and right runs to preview the prompt.</p>
        ) : null}
      </div>
    </PlModal>
  );
}
