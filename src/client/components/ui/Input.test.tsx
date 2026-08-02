// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input, Select } from './Input.js';

describe('Input', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders label associated with input', () => {
    render(<Input id="name" label="Name" value="" onInput={vi.fn()} />);
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('forwards change events', () => {
    const onInput = vi.fn();
    render(<Input id="name" label="Name" value="" onInput={onInput} />);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Ada' } });
    expect(onInput).toHaveBeenCalled();
  });

  it('matches snapshot for labeled input', () => {
    const { container } = render(<Input id="name" label="Name" value="Ada" onInput={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Select', () => {
    const { container } = render(
      <Select
        id="lang"
        label="Language"
        value="en"
        onChange={vi.fn()}
        options={[
          { value: 'en', label: 'English' },
          { value: 'ru', label: 'Russian' },
        ]}
      />
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
