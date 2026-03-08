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
  text-align: center;
  border-left: 4px solid #9d6fff;
  background: rgba(157, 111, 255, 0.15);
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  font-family: monospace;
  font-size: 0.9em;
  border-radius: 4px;
}

/* Block: note */
.note {
  border: 1px solid rgba(128, 128, 128, 0.4);
  background: rgba(128, 128, 128, 0.08);
  padding: 1rem;
  margin: 0.5rem 0;
  font-style: italic;
  border-radius: 6px;
}

/* Block: letter (epistolary style, distinct from note) */
.letter {
  text-align: center;
  max-width: 90%;
  margin-left: auto;
  margin-right: auto;
  border: 1px solid rgba(128, 128, 128, 0.4);
  background: rgba(128, 128, 128, 0.08);
  padding: 1.25rem 1.5rem;
  margin: 0.5rem 0;
  font-style: italic;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Block: inner-voice */
.inner-voice {
  font-style: italic;
  opacity: 0.9;
  padding: 0.25rem 0 0.25rem 1em;
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
