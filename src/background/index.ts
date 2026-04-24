// Background service worker.
//
// Why a SW?  Fetch calls to arbitrary OpenAI-compatible endpoints (OpenAI,
// Anthropic, Ollama on localhost, etc.) from a content script trip over
// page CSP and CORS.  Doing them in the SW sidesteps both because the
// request originates from the extension's own origin and respects
// host_permissions directly.
import { callOpenAICompatible } from '../providers/openai';
import type { ApiConfig } from '../providers/types';

interface DetectMessage {
  type: 'LLM_DETECT';
  config: ApiConfig;
  text: string;
}

interface TestMessage {
  type: 'LLM_TEST';
  config: ApiConfig;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'LLM_DETECT' && msg?.type !== 'LLM_TEST') {
    return false;
  }

  // Wrap the entire async path so no thrown error can leave the message
  // channel hanging — that produces the dreaded "channel closed before a
  // response was received" log on the caller side.
  (async () => {
    try {
      if (msg.type === 'LLM_DETECT') {
        const score = await handleDetect(msg as DetectMessage);
        sendResponse({ ok: true, score });
      } else {
        const result = await handleTest(msg as TestMessage);
        sendResponse({ ok: true, ...result });
      }
    } catch (err) {
      console.error('[AI Detector SW]', msg.type, 'failed:', err);
      try {
        sendResponse({
          ok: false,
          error: String((err as Error)?.message ?? err),
        });
      } catch {
        /* channel may already be closed; nothing else we can do */
      }
    }
  })();

  return true; // keep channel open for async sendResponse
});

async function handleDetect(msg: DetectMessage): Promise<number> {
  if (!msg.config?.baseURL) {
    throw new Error('API baseURL is not configured');
  }
  return callOpenAICompatible(msg.config, msg.text);
}

async function handleTest(
  msg: TestMessage
): Promise<{ score: number; sampleOutput: string }> {
  const score = await callOpenAICompatible(msg.config, 'Hello, world.');
  return { score, sampleOutput: `Returned score: ${(score * 100).toFixed(0)}` };
}
