import { useState } from 'preact/hooks';
import { PlModal } from './PlModal';
import { PlDiffView } from './PlDiffView';
import { SaveVersionForm } from './SaveVersionForm';
import { isTextModified } from '../utils/diff';

export type PromptEditorTab = 'system' | 'user';

interface PromptEditorModalProps {
  open: boolean;
  onClose: () => void;
  systemPrompt: string;
  baselineSystemPrompt: string;
  userPrompt: string;
  baselineUserPrompt: string;
  useUserOverride: boolean;
  onSystemChange: (value: string) => void;
  onUserChange: (value: string) => void;
  onUseUserOverrideChange: (value: boolean) => void;
  onReset: () => void;
  onSaveVersion: (name: string) => Promise<void>;
}

export function PromptEditorModal({
  open,
  onClose,
  systemPrompt,
  baselineSystemPrompt,
  userPrompt,
  baselineUserPrompt,
  useUserOverride,
  onSystemChange,
  onUserChange,
  onUseUserOverrideChange,
  onReset,
  onSaveVersion,
}: PromptEditorModalProps) {
  const [tab, setTab] = useState<PromptEditorTab>('system');
  const [showDiff, setShowDiff] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);

  const activeText = tab === 'system' ? systemPrompt : userPrompt;
  const baselineText = tab === 'system' ? baselineSystemPrompt : baselineUserPrompt;
  const lineCount = activeText.split('\n').length;
  const charCount = activeText.length;
  const systemModified = isTextModified(baselineSystemPrompt, systemPrompt);
  const userModified = useUserOverride && isTextModified(baselineUserPrompt, userPrompt);

  return (
    <PlModal
      open={open}
      title="Prompt editor"
      onClose={onClose}
      size="fullscreen"
      footer={
        <div class="pl-prompt-editor-footer">
          <span class="pl-muted">
            {lineCount} lines · {charCount} chars
            {systemModified || userModified ? ' · modified' : ''}
          </span>
          <div class="pl-row">
            <button type="button" class="pl-btn secondary" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? 'Hide diff' : 'Compare baseline'}
            </button>
            <button type="button" class="pl-btn secondary" onClick={onReset}>
              Reset to current
            </button>
            {showSaveForm ? (
              <SaveVersionForm
                onSave={async (name) => {
                  await onSaveVersion(name);
                  setShowSaveForm(false);
                }}
                onCancel={() => setShowSaveForm(false)}
              />
            ) : (
              <button type="button" class="pl-btn secondary" onClick={() => setShowSaveForm(true)}>
                Save as version
              </button>
            )}
            <button type="button" class="pl-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      }
    >
      <div class="pl-prompt-editor-tabs">
        <button
          type="button"
          class={`pl-tab-inline${tab === 'system' ? ' active' : ''}${systemModified ? ' modified' : ''}`}
          onClick={() => setTab('system')}
        >
          System
        </button>
        <button
          type="button"
          class={`pl-tab-inline${tab === 'user' ? ' active' : ''}${userModified ? ' modified' : ''}`}
          onClick={() => setTab('user')}
        >
          User
        </button>
      </div>

      {tab === 'user' ? (
        <label class="pl-checkbox-label pl-prompt-override-toggle">
          <input
            type="checkbox"
            checked={useUserOverride}
            onChange={(e) => onUseUserOverrideChange(e.currentTarget.checked)}
          />
          Override user prompt (disable live preview)
        </label>
      ) : null}

      {showDiff ? (
        <div class="pl-prompt-editor-diff">
          <PlDiffView baseline={baselineText} current={activeText} />
        </div>
      ) : (
        <textarea
          class="pl-textarea pl-textarea--editor"
          value={activeText}
          readOnly={tab === 'user' && !useUserOverride}
          onInput={(e) => {
            const v = e.currentTarget.value;
            if (tab === 'system') onSystemChange(v);
            else onUserChange(v);
          }}
        />
      )}
    </PlModal>
  );
}
