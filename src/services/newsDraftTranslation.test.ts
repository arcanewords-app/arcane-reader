import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock('../logger.js', () => ({
  logger: { error: vi.fn() },
}));

import { draftNewsTranslation } from './newsDraftTranslation.js';

const input = {
  title: 'Заголовок',
  summary: 'Кратко',
  body: 'Текст',
  targetLocale: 'en' as const,
  apiKey: 'test-key',
};

function completion(content: string) {
  return { choices: [{ message: { content } }] };
}

describe('draftNewsTranslation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a validated draft and uses the default model', async () => {
    mockCreate.mockResolvedValue(
      completion(JSON.stringify({ title: ' Title ', summary: ' Summary ', body: 'Body' }))
    );

    await expect(draftNewsTranslation(input)).resolves.toEqual({
      title: 'Title',
      summary: 'Summary',
      body: 'Body',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4.1-mini',
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('English'),
          }),
        ]),
      })
    );
  });

  it('passes a custom model and timeout', async () => {
    mockCreate.mockResolvedValue(
      completion(JSON.stringify({ title: 'T', summary: 'S', body: 'B' }))
    );
    await draftNewsTranslation({ ...input, targetLocale: 'be', model: 'gpt-4.1', timeout: 1000 });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4.1' }));
    const userMessage = mockCreate.mock.calls[0]?.[0].messages[1].content as string;
    expect(userMessage).toContain('Belarusian');
  });

  it('rejects a response that is not JSON or fails the draft schema', async () => {
    mockCreate.mockResolvedValue(completion('not-json'));
    await expect(draftNewsTranslation(input)).rejects.toThrow('invalid draft');

    mockCreate.mockResolvedValue(
      completion(JSON.stringify({ title: '', summary: 'S', body: 'B' }))
    );
    await expect(draftNewsTranslation({ ...input, targetLocale: 'pl' })).rejects.toThrow(
      'invalid draft'
    );

    mockCreate.mockResolvedValue({ choices: [] });
    await expect(draftNewsTranslation(input)).rejects.toThrow('invalid draft');
  });
});
