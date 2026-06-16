import { truncatePreview, isTextModified } from '../utils/diff';

interface PromptPreviewCardProps {
  title: string;
  preview: string;
  modified?: boolean;
  onEdit: () => void;
}

export function PromptPreviewCard({ title, preview, modified, onEdit }: PromptPreviewCardProps) {
  return (
    <div class={`pl-prompt-card${modified ? ' modified' : ''}`}>
      <div class="pl-prompt-card-header">
        <span class="pl-prompt-card-title">
          {title}
          {modified ? <span class="pl-badge modified">modified</span> : null}
        </span>
        <button type="button" class="pl-btn secondary pl-btn--sm" onClick={onEdit}>
          Edit
        </button>
      </div>
      <pre class="pl-prompt-preview">{truncatePreview(preview, 400)}</pre>
    </div>
  );
}

export { isTextModified };
