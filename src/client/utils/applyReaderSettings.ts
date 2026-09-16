import type { ReaderSettings } from '../types';

const DEFAULT_CONTAINER_WIDTH = 69;
const DEFAULT_PARAGRAPH_SPACING_EM = 0.5;

/** Apply reader typography/theme as CSS variables and data attributes on a root element. */
export function applyReaderSettings(root: HTMLElement, settings: ReaderSettings): void {
  root.style.setProperty('--reader-font-size', `${settings.fontSize}px`);
  root.style.setProperty('--reader-line-height', `${settings.lineHeight}`);
  root.style.setProperty(
    '--reader-paragraph-spacing',
    `${Math.max(DEFAULT_PARAGRAPH_SPACING_EM, settings.paragraphSpacing ?? DEFAULT_PARAGRAPH_SPACING_EM)}em`
  );
  root.style.setProperty(
    '--reader-container-width',
    `${settings.containerWidth ?? DEFAULT_CONTAINER_WIDTH}%`
  );
  root.setAttribute('data-reader-font', settings.fontFamily);
  root.setAttribute('data-reader-theme', settings.colorScheme);
  root.setAttribute('data-reader-indent', settings.textIndent ? 'true' : 'false');
  root.setAttribute('data-reader-align', settings.textAlign ?? 'justify');
  if (settings.colorScheme === 'custom') {
    root.style.setProperty('--reader-bg', settings.customBg ?? '#f2f2f3');
    root.style.setProperty('--reader-text', settings.customText ?? '#212529');
  } else {
    root.style.removeProperty('--reader-bg');
    root.style.removeProperty('--reader-text');
  }
}

/** Remove reader CSS variables and data attributes previously applied to a root element. */
export function clearReaderSettings(root: HTMLElement): void {
  root.removeAttribute('data-reader-font');
  root.removeAttribute('data-reader-theme');
  root.removeAttribute('data-reader-indent');
  root.removeAttribute('data-reader-align');
  root.style.removeProperty('--reader-font-size');
  root.style.removeProperty('--reader-line-height');
  root.style.removeProperty('--reader-paragraph-spacing');
  root.style.removeProperty('--reader-container-width');
  root.style.removeProperty('--reader-bg');
  root.style.removeProperty('--reader-text');
}
