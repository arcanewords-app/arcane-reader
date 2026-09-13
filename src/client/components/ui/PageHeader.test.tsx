// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader.js';

describe('PageHeader', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders title, subtitle, actions, and extra children', () => {
    render(
      <PageHeader
        title="Publications"
        subtitle="Published translations"
        actions={<button>Suggest</button>}
      >
        <div>tabs</div>
      </PageHeader>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Publications' })).toBeTruthy();
    expect(screen.getByText('Published translations')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeTruthy();
    expect(screen.getByText('tabs')).toBeTruthy();
  });

  it('matches snapshot', () => {
    const { container } = render(
      <PageHeader
        title="My projects"
        subtitle="7 projects"
        actions={<button>New project</button>}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
