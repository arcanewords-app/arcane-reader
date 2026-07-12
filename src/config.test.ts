import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';
import { hasAIProvider, loadConfig, validateConfig, type AppConfig } from './config.js';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  process.env = { ...ORIGINAL_ENV };
}

describe('loadConfig', () => {
  afterEach(restoreEnv);

  it('parses defaults when env vars are absent', () => {
    delete process.env.PORT;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.SKIP_EDITING;
    delete process.env.NEVER_SPLIT_PARAGRAPHS;

    const config = loadConfig();

    assert.equal(config.port, 3000);
    assert.equal(config.openai.apiKey, '');
    assert.equal(config.openai.model, 'gpt-4.1-mini');
    assert.equal(config.openai.timeout, 600_000);
    assert.equal(config.openai.maxRetries, 3);
    assert.equal(config.translation.maxTokensPerChunk, 3000);
    assert.equal(config.translation.temperature, 0.7);
    assert.equal(config.translation.skipEditing, false);
    assert.equal(config.translation.neverSplitParagraphs, true);
    assert.equal(config.upload.maxFileSizeBytes, 50 * 1024 * 1024);
  });

  it('parses custom env overrides', () => {
    process.env.PORT = '4000';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.OPENAI_MODEL = 'gpt-5.4-mini';
    process.env.TRANSLATION_TEMPERATURE = '0.2';
    process.env.SKIP_EDITING = 'true';
    process.env.NEVER_SPLIT_PARAGRAPHS = 'false';
    process.env.PARALLEL_CHUNKS = '5';

    const config = loadConfig();

    assert.equal(config.port, 4000);
    assert.equal(config.openai.apiKey, 'sk-test');
    assert.equal(config.openai.model, 'gpt-5.4-mini');
    assert.equal(config.translation.temperature, 0.2);
    assert.equal(config.translation.skipEditing, true);
    assert.equal(config.translation.neverSplitParagraphs, false);
    assert.equal(config.translation.parallelChunks, 5);
  });
});

describe('validateConfig', () => {
  function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
    return {
      port: 3000,
      openai: { apiKey: 'sk-test', model: 'gpt-4.1-mini' },
      translation: {
        maxTokensPerChunk: 3000,
        temperature: 0.7,
        skipEditing: false,
      },
      storage: { projectsDir: './data/projects', cacheDir: './data/cache' },
      upload: { maxFileSizeBytes: 50 * 1024 * 1024 },
      ...overrides,
    };
  }

  it('returns valid for well-formed config', () => {
    const result = validateConfig(baseConfig());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });

  it('requires OpenAI API key', () => {
    const result = validateConfig(baseConfig({ openai: { apiKey: '', model: 'gpt-4.1-mini' } }));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('OPENAI_API_KEY')));
  });

  it('rejects API key without sk- prefix', () => {
    const result = validateConfig(
      baseConfig({ openai: { apiKey: 'bad-key', model: 'gpt-4.1-mini' } })
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('sk-')));
  });

  it('rejects temperature outside 0..1', () => {
    const result = validateConfig(
      baseConfig({
        translation: { maxTokensPerChunk: 3000, temperature: 1.5, skipEditing: false },
      })
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Температура')));
  });
});

describe('hasAIProvider', () => {
  it('returns true when api key is set', () => {
    assert.equal(
      hasAIProvider({ openai: { apiKey: 'sk-test', model: 'gpt-4.1-mini' } } as AppConfig),
      true
    );
  });

  it('returns false when api key is empty', () => {
    assert.equal(
      hasAIProvider({ openai: { apiKey: '', model: 'gpt-4.1-mini' } } as AppConfig),
      false
    );
  });
});
