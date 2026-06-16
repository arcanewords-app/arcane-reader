import type { ComponentChildren } from 'preact';
import { alignParagraphRows, textToDisplayParagraphs } from '../utils/paragraphs.js';

interface Props {
  leftText: string;
  rightText: string;
  leftLabel?: string;
  rightLabel?: string;
  leftSubtitle?: ComponentChildren;
  rightSubtitle?: ComponentChildren;
}

export function PlParagraphCompareView({
  leftText,
  rightText,
  leftLabel = 'Left',
  rightLabel = 'Right',
  leftSubtitle,
  rightSubtitle,
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
        <div class="pl-compare-header">
          <div>{leftLabel}</div>
          {leftSubtitle ? <div class="pl-compare-header-sub">{leftSubtitle}</div> : null}
        </div>
        <div class="pl-compare-header">
          <div>{rightLabel}</div>
          {rightSubtitle ? <div class="pl-compare-header-sub">{rightSubtitle}</div> : null}
        </div>
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
