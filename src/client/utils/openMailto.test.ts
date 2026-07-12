/** @vitest-environment happy-dom */
import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';
import { buildMailtoHref, openMailto } from './openMailto.js';

describe('openMailto', () => {
  it('buildMailtoHref encodes subject and body', () => {
    const href = buildMailtoHref({
      to: 'user@example.com',
      subject: 'Hello',
      body: 'Line 1',
    });
    assert.match(href, /^mailto:user@example.com\?/);
    assert.match(href, /subject=Hello/);
    assert.match(href, /body=Line/);
  });

  it('openMailto clicks transient anchor', () => {
    const click = vi.fn();
    const anchor = document.createElement('a');
    anchor.click = click;
    const create = vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const append = vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor);
    const remove = vi.spyOn(document.body, 'removeChild').mockImplementation(() => anchor);

    openMailto({ to: 'user@example.com', subject: 'Hi' });

    assert.equal(click.mock.calls.length, 1);
    create.mockRestore();
    append.mockRestore();
    remove.mockRestore();
  });
});
