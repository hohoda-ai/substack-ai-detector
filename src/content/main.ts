// Entry point: watches the Substack DOM, runs the active detection
// provider on every new note, and decorates each note with a colour-coded
// pill that sits flush with the reply button.

import { createProvider } from '../providers';
import type { Provider, Settings } from '../providers/types';
import { DEFAULT_SETTINGS, MIN_TEXT_CHARS } from '../providers/types';
import { collectNotes } from './extractor';
import { getOrCreateBadge, renderError, renderResult, setLoading } from './badge';

/**
 * Map root → last text we scored. We use text-based dedupe instead of a
 * plain WeakSet so notes that get expanded ("See more" click) are
 * automatically re-scored with their full body.
 */
const SCORED_TEXT = new WeakMap<HTMLElement, string>();
const RESULT_CACHE = new Map<string, Promise<number>>();

let settings: Settings = DEFAULT_SETTINGS;
let provider: Provider = createProvider(settings);

async function loadSettings(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('settings');
    if (stored.settings) {
      settings = deepMerge(DEFAULT_SETTINGS, stored.settings) as Settings;
    }
  } catch {
    /* ignore */
  }
  provider = createProvider(settings);
  provider.preload?.();
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof (out as any)[k] === 'object') {
      out[k] = deepMerge((out as any)[k], v as any);
    } else {
      out[k] = v;
    }
  }
  return out;
}

chrome.storage?.onChanged.addListener((changes) => {
  if (changes.settings?.newValue) {
    settings = deepMerge(DEFAULT_SETTINGS, changes.settings.newValue) as Settings;
    provider = createProvider(settings);
    provider.preload?.();
    // Let new settings rescore existing notes on next observer tick.
    RESULT_CACHE.clear();
  }
});

async function processNote(
  root: HTMLElement,
  actionBar: HTMLElement,
  text: string,
  truncated: boolean
) {
  // Skip if we already scored THIS exact text for THIS root. If the user
  // clicks "See more" themselves, the text grows and we re-score below.
  if (SCORED_TEXT.get(root) === text) return;
  SCORED_TEXT.set(root, text);

  const badge = getOrCreateBadge(actionBar);

  // Skip notes whose author-written body is too short — link-card-only
  // shares, image notes, single-emoji replies. These produce extreme
  // false positives in any classifier.
  if (text.length < MIN_TEXT_CHARS) {
    renderResult(
      badge,
      {
        score: 0,
        label: 'na',
        reason: `text too short (${text.length} chars, need ≥ ${MIN_TEXT_CHARS})`,
      },
      text,
      truncated
    );
    return;
  }

  setLoading(badge);

  const cacheKey = `${settings.mode}:${text.slice(0, 500)}`;
  let scorePromise = RESULT_CACHE.get(cacheKey);
  if (!scorePromise) {
    scorePromise = provider.detect(text).then((r) => r.score);
    RESULT_CACHE.set(cacheKey, scorePromise);
  }

  try {
    const score = await scorePromise;
    const label =
      score >= settings.threshold.ai
        ? 'ai'
        : score >= settings.threshold.mixed
          ? 'mixed'
          : 'human';
    renderResult(badge, { score, label }, text, truncated);
  } catch (err) {
    console.warn('[AI Detector] detection failed', err);
    renderError(badge, String((err as Error)?.message ?? err));
  }
}

function scan() {
  if (!settings.enabled) return;
  for (const note of collectNotes()) {
    void processNote(note.root, note.actionBar, note.text, note.truncated);
  }
}

let scanTimer: number | undefined;
function scheduleScan() {
  if (scanTimer) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = undefined;
    scan();
  }, 250);
}

async function main() {
  await loadSettings();
  if (!settings.enabled) return;

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });

  scheduleScan();
  window.addEventListener('load', scheduleScan, { once: true });
  document.addEventListener('scroll', scheduleScan, { passive: true });
}

void main();
