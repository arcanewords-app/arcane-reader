import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type OpenAI from 'openai';
import { OpenAIProvider } from './openai.js';

type MockResponse = OpenAI.Chat.Completions.ChatCompletion;

function mockCompletion(
  content: string | null,
  finishReason:
    'stop' | 'length' | 'content_filter' | 'tool_calls' | 'function_call' | null = 'stop'
): MockResponse {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4.1-mini',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content, refusal: null },
        finish_reason: finishReason as 'stop',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

function providerWithMockCreate(
  create: () => Promise<MockResponse> | MockResponse,
  model = 'gpt-4.1-mini'
): OpenAIProvider {
  const provider = new OpenAIProvider({ apiKey: 'test-key', model });
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

describe('OpenAIProvider.complete', () => {
  it('returns text content and token usage', async () => {
    const provider = providerWithMockCreate(() => mockCompletion('Hello world'));
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(result.content, 'Hello world');
    assert.equal(result.tokensUsed.total, 30);
    assert.equal(result.finishReason, 'stop');
  });

  it('maps content_filter finish reason', async () => {
    const provider = providerWithMockCreate(() => mockCompletion('filtered', 'content_filter'));
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(result.finishReason, 'content_filter');
  });

  it('maps unknown finish reason to error', async () => {
    const provider = providerWithMockCreate(() => mockCompletion('x', null));
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(result.finishReason, 'error');
  });

  it('returns empty string when content is null', async () => {
    const provider = providerWithMockCreate(() => mockCompletion(null));
    const result = await provider.complete([{ role: 'user', content: 'hi' }]);
    assert.equal(result.content, '');
  });

  it('rethrows rate limit errors from API', async () => {
    const rateLimitErr = Object.assign(new Error('rate limit'), { status: 429 });
    const provider = providerWithMockCreate(() => {
      throw rateLimitErr;
    });
    await assert.rejects(
      () => provider.complete([{ role: 'user', content: 'hi' }]),
      (err: unknown) => (err as { status?: number }).status === 429
    );
  });
});

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

  it('throws empty JSON error when both attempts return empty content', async () => {
    const provider = providerWithMockCreate(() => mockCompletion('   ', 'stop'));
    await assert.rejects(
      () => provider.completeJSON<Record<string, unknown>>([{ role: 'user', content: 'test' }]),
      /Empty JSON response/
    );
  });

  it('retries on invalid JSON then succeeds', async () => {
    let call = 0;
    const provider = providerWithMockCreate(() => {
      call += 1;
      return mockCompletion(call === 1 ? 'not-json' : '{"ok":true}', 'stop');
    });
    const result = await provider.completeJSON<{ ok: boolean }>([
      { role: 'user', content: 'test' },
    ]);
    assert.equal(result.data.ok, true);
    assert.equal(call, 2);
  });

  it('throws parse error after retry exhausted', async () => {
    const provider = providerWithMockCreate(() => mockCompletion('not-json', 'stop'));
    await assert.rejects(
      () => provider.completeJSON<Record<string, unknown>>([{ role: 'user', content: 'test' }]),
      /Failed to parse JSON/
    );
  });

  it('throws truncation error after retry exhausted on length', async () => {
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

describe('OpenAIProvider.completeStructuredJSON', () => {
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };

  it('returns parsed structured JSON on success', async () => {
    const provider = providerWithMockCreate(() => mockCompletion('{"ok":true}', 'stop'));
    const result = await provider.completeStructuredJSON<{ ok: boolean }>(
      [{ role: 'user', content: 'test' }],
      schema,
      'TestSchema'
    );
    assert.equal(result.data.ok, true);
  });

  it('retries when structured response is truncated', async () => {
    let call = 0;
    const provider = providerWithMockCreate(() => {
      call += 1;
      if (call === 1) {
        return mockCompletion('{"partial":', 'length');
      }
      return mockCompletion('{"ok":true}', 'stop');
    });
    const result = await provider.completeStructuredJSON<{ ok: boolean }>(
      [{ role: 'user', content: 'test' }],
      schema,
      'TestSchema'
    );
    assert.equal(result.data.ok, true);
    assert.equal(call, 2);
  });

  it('throws when structured JSON stays empty after retries', async () => {
    const provider = providerWithMockCreate(() => mockCompletion('', 'stop'));
    await assert.rejects(
      () =>
        provider.completeStructuredJSON<Record<string, unknown>>(
          [{ role: 'user', content: 'test' }],
          schema,
          'TestSchema'
        ),
      /Empty structured JSON/
    );
  });

  it('retries on structured JSON parse failure', async () => {
    let call = 0;
    const provider = providerWithMockCreate(() => {
      call += 1;
      return mockCompletion(call === 1 ? 'bad' : '{"ok":true}', 'stop');
    });
    const result = await provider.completeStructuredJSON<{ ok: boolean }>(
      [{ role: 'user', content: 'test' }],
      schema,
      'TestSchema'
    );
    assert.equal(result.data.ok, true);
    assert.equal(call, 2);
  });
});

describe('OpenAIProvider.isAvailable', () => {
  it('returns true when models.list succeeds', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4.1-mini' });
    (provider as unknown as { client: { models: { list: () => Promise<unknown> } } }).client = {
      models: { list: async () => ({ data: [] }) },
    };
    assert.equal(await provider.isAvailable(), true);
  });

  it('returns false when models.list fails', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4.1-mini' });
    (provider as unknown as { client: { models: { list: () => Promise<unknown> } } }).client = {
      models: {
        list: async () => {
          throw new Error('network');
        },
      },
    };
    assert.equal(await provider.isAvailable(), false);
  });
});

describe('OpenAIProvider.estimateTokens', () => {
  it('returns positive estimate for non-empty text', () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key', model: 'gpt-4.1-mini' });
    assert.ok(provider.estimateTokens('Hello world') > 0);
    assert.equal(provider.estimateTokens(''), 0);
  });
});
