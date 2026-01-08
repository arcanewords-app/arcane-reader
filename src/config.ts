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
  };
  anthropic: {
    apiKey: string;
  };
  
  // Translation settings
  translation: {
    maxTokensPerChunk: number;
    temperature: number;
    skipEditing: boolean;
  };
  
  // Storage
  storage: {
    projectsDir: string;
    cacheDir: string;
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
      model: process.env.OPENAI_MODEL ?? 'gpt-4-turbo-preview',
    },
    
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    },
    
    translation: {
      maxTokensPerChunk: parseInt(process.env.MAX_TOKENS_PER_CHUNK ?? '2000', 10),
      temperature: parseFloat(process.env.TRANSLATION_TEMPERATURE ?? '0.7'),
      skipEditing: process.env.SKIP_EDITING === 'true',
    },
    
    storage: {
      projectsDir: process.env.PROJECTS_DIR ?? './data/projects',
      cacheDir: process.env.CACHE_DIR ?? './data/cache',
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

