import { textToDisplayParagraphs } from '../utils/paragraphs.js';

interface Props {
  text: string;
  label?: string;
}

export function PlParagraphPreview({ text, label = 'Paragraphs' }: Props) {
  const paras = textToDisplayParagraphs(text);
  if (!text.trim()) {
    return <p class="pl-muted">No text.</p>;
  }

  return (
    <div class="pl-para-preview">
      <div class="pl-para-preview-header">
        <span class="pl-label">
          {label} ({paras.length})
        </span>
      </div>
      <div class="pl-compare-scroll pl-para-preview-scroll">
        {paras.map((p, i) => (
          <div class="pl-compare-row pl-para-preview-row" key={p.id ?? `p-${i}`}>
            <span class="pl-para-preview-index" aria-hidden="true">
              {i + 1}
            </span>
            <div class="pl-compare-cell pl-para-preview-cell">
              {p.id ? <span class="pl-muted pl-para-preview-id">{p.id}</span> : null}
              <div class="pl-para-preview-text">{p.text || '\u00a0'}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
