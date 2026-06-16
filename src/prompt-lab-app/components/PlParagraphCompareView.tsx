import { alignParagraphRows, textToDisplayParagraphs } from '../utils/paragraphs.js';

interface Props {
  leftText: string;
  rightText: string;
  leftLabel?: string;
  rightLabel?: string;
}

export function PlParagraphCompareView({
  leftText,
  rightText,
  leftLabel = 'Left',
  rightLabel = 'Right',
}: Props) {
  const leftParas = textToDisplayParagraphs(leftText);
  const rightParas = textToDisplayParagraphs(rightText);
  const { left, right, mismatch } = alignParagraphRows(leftParas, rightParas);

  if (!leftText.trim() && !rightText.trim()) {
    return <p class="pl-muted">Select runs to compare.</p>;
  }

  return (
    <div class="pl-compare">
      {mismatch ? (
        <div class="pl-banner warn" role="status">
          Paragraph count mismatch: {leftParas.length} left vs {rightParas.length} right
        </div>
      ) : null}
      <div class="pl-compare-headers">
        <div class="pl-compare-header">{leftLabel}</div>
        <div class="pl-compare-header">{rightLabel}</div>
      </div>
      <div class="pl-compare-scroll">
        {left.map((lp, i) => (
          <div class="pl-compare-row" key={lp.id ?? `row-${i}`}>
            <div class="pl-compare-cell">{lp.text || '\u00a0'}</div>
            <div class="pl-compare-cell">{right[i]?.text || '\u00a0'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
