import type { Provider, Settings } from './types';
import { LocalProvider } from './local';
import { OpenAIProvider } from './openai';

export function createProvider(settings: Settings): Provider {
  if (settings.mode === 'api') {
    return new OpenAIProvider(settings.api, settings.threshold);
  }
  return new LocalProvider(settings.threshold);
}

export * from './types';
