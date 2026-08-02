// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { AlertModal } from './AlertModal.js';

describe('AlertModal', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  it('matches snapshot when open with fixed title and message', () => {
    render(
      <AlertModal
        isOpen
        onClose={vi.fn()}
        title="Something went wrong"
        message="Fixed alert message"
      />
    );
    expect(document.querySelector('.modal-overlay')).toMatchSnapshot();
  });
});
