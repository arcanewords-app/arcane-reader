import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ILLMProvider, Message } from '../interfaces/llm-provider.js';

/** Mirrors OpenAIProvider: instance method reads `this.client`. */
class MockStructuredProvider implements Pick<ILLMProvider, 'completeStructuredJSON'> {
  client = { id: 'mock-client' };

  async completeStructuredJSON<T>(
    messages: Message[],
    schema: Record<string, unknown>,
    schemaName: string
  ): Promise<{ data: T; tokensUsed: { prompt: number; completion: number; total: number } }> {
    void messages;
    void schema;
    void schemaName;
    if (!(this as MockStructuredProvider).client) {
      throw new Error('client missing — method was called without provider context');
    }
    return {
      data: { paragraphs: [{ id: 'p1', translated: 'ok' }] } as T,
      tokensUsed: { prompt: 1, completion: 1, total: 2 },
    };
  }
}

describe('completeStructuredJSON provider binding', () => {
  it('fails when method is detached from provider instance', async () => {
    const provider = new MockStructuredProvider();
    const detached = provider.completeStructuredJSON;
    await assert.rejects(() => detached([], {}, 'test'), /client/);
  });

  it('succeeds when called on provider instance', async () => {
    const provider = new MockStructuredProvider();
    const result = await provider.completeStructuredJSON<{
      paragraphs: Array<{ translated: string }>;
    }>([], {}, 'test');
    assert.equal(result.data.paragraphs[0]?.translated, 'ok');
  });

  it('succeeds when called via optional chaining on provider reference', async () => {
    const provider: Pick<ILLMProvider, 'completeStructuredJSON'> = new MockStructuredProvider();
    const result = await provider.completeStructuredJSON!<{
      paragraphs: Array<{ translated: string }>;
    }>([], {}, 'test');
    assert.equal(result.data.paragraphs[0]?.translated, 'ok');
  });
});
