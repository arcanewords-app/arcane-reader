/**
 * EPUB CSS styles
 * Combines epub-gen-memory default styles with text block styles.
 * No CSS variables - EPUB readers often don't support them.
 */

const EPUB_DEFAULT_CSS = `
.epub-author {
  color: #555;
}

.epub-link {
  margin-bottom: 30px;
}

.epub-link a {
  color: #666;
  font-size: 90%;
}

.toc-author {
  font-size: 90%;
  color: #555;
}

.toc-link {
  color: #999;
  font-size: 85%;
  display: block;
}

hr {
  border: 0;
  border-bottom: 1px solid #dedede;
  margin: 60px 10%;
}
`.trim();

const TEXT_BLOCK_CSS = `
/* Block: system-message */
.system-message,
div.system-message {
  display: block;
  border-left: 4px solid #9d6fff;
  background: rgba(157, 111, 255, 0.15);
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  font-family: monospace;
  font-size: 0.9em;
  border-radius: 4px;
}

/* Block: note, letter */
.note,
.letter {
  border: 1px solid rgba(128, 128, 128, 0.4);
  background: rgba(128, 128, 128, 0.08);
  padding: 1rem;
  margin: 0.5rem 0;
  font-style: italic;
  border-radius: 6px;
}

/* Block: inner-voice */
.inner-voice {
  font-style: italic;
  opacity: 0.9;
  padding: 0.25rem 0;
}

/* Inline: notification */
.notification {
  background: rgba(157, 111, 255, 0.15);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-size: 0.95em;
}

/* Inline: skill */
.skill {
  font-weight: 600;
  color: #9d6fff;
}
`.trim();

/** Full CSS for EPUB export (defaults + text blocks) */
export const EPUB_CSS = `${EPUB_DEFAULT_CSS}\n\n${TEXT_BLOCK_CSS}`;
