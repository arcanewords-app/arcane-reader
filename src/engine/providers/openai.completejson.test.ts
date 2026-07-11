import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type OpenAI from 'openai';
import { OpenAIProvider } from './openai.js';

type MockResponse = OpenAI.Chat.Completions.ChatCompletion;

function mockCompletion(content: string, finishReason: 'stop' | 'length' = 'stop'): MockResponse {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4.1-mini',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content, refusal: null },
        finish_reason: finishReason,
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

function providerWithMockCreate(
  create: () => Promise<MockResponse> | MockResponse
): OpenAIProvider {
  const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4.1-mini' });
  (provider as unknown as { client: { chat: { completions: { create: typeof create } } } }).client =
    {
      chat: {
        completions: {
          create: async () => create(),
        },
      },
    };
  return provider;
}

describe('OpenAIProvider.completeJSON', () => {
  it('retries when first response is truncated and succeeds on second attempt', async () => {
    let call = 0;
    const provider = providerWithMockCreate(() => {
      call += 1;
      if (call === 1) {
        return mockCompletion('{"partial":', 'length');
      }
      return mockCompletion('{"ok":true}', 'stop');
    });

    const result = await provider.completeJSON<{ ok: boolean }>([
      { role: 'user', content: 'test' },
    ]);
    assert.equal(result.data.ok, true);
    assert.equal(call, 2);
  });

  it('throws a concise truncation error after retry is exhausted', async () => {
    const provider = providerWithMockCreate(() => mockCompletion('{"partial":', 'length'));

    await assert.rejects(
      () =>
        provider.completeJSON<Record<string, unknown>>([{ role: 'user', content: 'test' }], {
          maxTokens: 8192,
        }),
      /truncated at max_tokens/
    );
  });
});
