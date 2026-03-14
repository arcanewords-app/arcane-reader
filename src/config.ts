/**
 * Configuration management for Arcane Reader
 */

export interface AppConfig {
  // Server
  port: number;

  // AI Providers
  openai: {
    apiKey: string;
    model: string;
    /** Request timeout in ms (e.g. for long analysis/translation). Default 600000 (10 min). */
    timeout?: number;
    /** SDK-level retries per request (OpenAI client). Default 3. */
    maxRetries?: number;
  };
  anthropic: {
    apiKey: string;
  };

  // Translation settings
  translation: {
    maxTokensPerChunk: number;
    temperature: number;
    skipEditing: boolean;
    /** Never split a paragraph into smaller chunks; keep 1:1 paragraph boundaries. Default true. */
    neverSplitParagraphs?: boolean;
    /** Number of retries for a failed translation chunk (default 2 = up to 3 attempts). */
    chunkRetryAttempts?: number;
    /** Delay in ms before each chunk retry (default 1500). */
    chunkRetryDelayMs?: number;
  };

  // Storage
  storage: {
    projectsDir: string;
    cacheDir: string;
  };

  // Upload limits (for chapter files)
  upload: {
    /** Max file size in bytes. Default 50MB. */
    maxFileSizeBytes: number;
  };
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000', 10),

    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini',
      timeout: parseInt(process.env.OPENAI_TIMEOUT_MS ?? '600000', 10),
      maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES ?? '3', 10),
    },

    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    },

    translation: {
      maxTokensPerChunk: parseInt(process.env.MAX_TOKENS_PER_CHUNK ?? '2000', 10),
      temperature: parseFloat(process.env.TRANSLATION_TEMPERATURE ?? '0.7'),
      skipEditing: process.env.SKIP_EDITING === 'true',
      neverSplitParagraphs: process.env.NEVER_SPLIT_PARAGRAPHS !== 'false',
      chunkRetryAttempts: parseInt(process.env.CHUNK_RETRY_ATTEMPTS ?? '2', 10),
      chunkRetryDelayMs: parseInt(process.env.CHUNK_RETRY_DELAY_MS ?? '1500', 10),
    },

    storage: {
      projectsDir: process.env.PROJECTS_DIR ?? './data/projects',
      cacheDir: process.env.CACHE_DIR ?? './data/cache',
    },

    upload: {
      maxFileSizeBytes: parseInt(
        process.env.UPLOAD_MAX_FILE_SIZE_BYTES ?? String(50 * 1024 * 1024),
        10
      ),
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: AppConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.openai.apiKey && !config.anthropic.apiKey) {
    errors.push('Необходим хотя бы один API ключ (OpenAI или Anthropic)');
  }

  if (config.openai.apiKey && !config.openai.apiKey.startsWith('sk-')) {
    errors.push('OpenAI API ключ должен начинаться с "sk-"');
  }

  if (config.translation.temperature < 0 || config.translation.temperature > 1) {
    errors.push('Температура должна быть от 0 до 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if AI provider is configured
 */
export function hasAIProvider(config: AppConfig): boolean {
  return Boolean(config.openai.apiKey || config.anthropic.apiKey);
}
