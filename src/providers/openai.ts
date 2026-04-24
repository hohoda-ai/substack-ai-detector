// Uses any OpenAI-compatible Chat Completions endpoint to score AI
// probability. Works unchanged against OpenAI, Anthropic (compat mode),
// DeepSeek, OpenRouter, Ollama, LM Studio, vLLM, etc.
//
// The actual fetch is proxied through the background service worker to
// avoid CORS/CSP issues and keep the API key out of page context.
import type { ApiConfig, Provider, Settings, DetectionResult } from './types';
import { scoreToLabel } from './types';

const MAX_CHARS = 4000; // APIs can handle longer inputs than local RoBERTa

export class OpenAIProvider implements Provider {
  constructor(
    private readonly config: ApiConfig,
    private readonly thresholds: Settings['threshold']
  ) {}

  async detect(text: string): Promise<DetectionResult> {
    const clean = text.trim().slice(0, MAX_CHARS);
    if (clean.length < 40) return { score: 0, label: 'human' };

    const response = await chrome.runtime.sendMessage({
      type: 'LLM_DETECT',
      config: this.config,
      text: clean,
    });

    if (!response?.ok) {
      throw new Error(response?.error ?? 'unknown LLM error');
    }

    const score = Math.max(0, Math.min(1, Number(response.score) || 0));
    return { score, label: scoreToLabel(score, this.thresholds) };
  }
}

/**
 * Helpers used by the background service worker. Kept in the same file so
 * the provider's request/response contract lives in one place.
 */
export async function callOpenAICompatible(
  config: ApiConfig,
  text: string
): Promise<number> {
  const url = joinUrl(config.baseURL, '/chat/completions');
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 90000
  );

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 5,
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const content: string =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      '';
    return parseScore(content);
  } finally {
    clearTimeout(timer);
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path);
}

/**
 * Models sometimes answer "72", "72%", "Score: 72", etc. Pull the first
 * reasonable integer / float out and normalize to 0–1.
 */
export function parseScore(raw: string): number {
  if (!raw) return 0;
  const m = raw.match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  let n = parseFloat(m[0]);
  if (Number.isNaN(n)) return 0;
  if (n > 1) n = n / 100; // treat 0–100 scale as 0–1
  return Math.max(0, Math.min(1, n));
}
