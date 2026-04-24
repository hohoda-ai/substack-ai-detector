import {
  DEFAULT_SETTINGS,
  PRESETS,
  type ApiConfig,
  type DetectionMode,
  type Settings,
} from '../providers/types';

const els = {
  enabled: byId<HTMLInputElement>('enabled'),
  modeLocal: byId<HTMLButtonElement>('mode-local'),
  modeApi: byId<HTMLButtonElement>('mode-api'),
  modeHint: byId<HTMLElement>('mode-hint'),
  apiBlock: byId<HTMLElement>('api-block'),
  preset: byId<HTMLSelectElement>('preset'),
  baseURL: byId<HTMLInputElement>('baseURL'),
  apiKey: byId<HTMLInputElement>('apiKey'),
  model: byId<HTMLInputElement>('model'),
  systemPrompt: byId<HTMLTextAreaElement>('systemPrompt'),
  test: byId<HTMLButtonElement>('test'),
  testResult: byId<HTMLElement>('test-result'),
  thMixed: byId<HTMLInputElement>('th-mixed'),
  thAi: byId<HTMLInputElement>('th-ai'),
  save: byId<HTMLButtonElement>('save'),
  saveStatus: byId<HTMLElement>('save-status'),
};

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function populatePresets() {
  els.preset.innerHTML = '';
  for (const [key, p] of Object.entries(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = p.label;
    els.preset.appendChild(opt);
  }
}

function applyMode(mode: DetectionMode) {
  els.modeLocal.classList.toggle('active', mode === 'local');
  els.modeApi.classList.toggle('active', mode === 'api');
  els.apiBlock.classList.toggle('hidden', mode !== 'api');
  els.modeHint.textContent =
    mode === 'local'
      ? 'RoBERTa runs entirely in your browser. First load downloads ~120 MB, then cached.'
      : 'Routes each note through an OpenAI-compatible Chat Completions endpoint. Your API key stays in extension storage.';
}

function render(settings: Settings) {
  els.enabled.checked = settings.enabled;
  applyMode(settings.mode);
  els.baseURL.value = settings.api.baseURL;
  els.apiKey.value = settings.api.apiKey;
  els.model.value = settings.api.model;
  els.systemPrompt.value = settings.api.systemPrompt;
  els.thMixed.value = String(settings.threshold.mixed);
  els.thAi.value = String(settings.threshold.ai);

  const match = Object.entries(PRESETS).find(
    ([, p]) => p.baseURL === settings.api.baseURL
  );
  els.preset.value = match ? match[0] : 'custom';
}

function readForm(): Settings {
  return {
    enabled: els.enabled.checked,
    mode: (document.querySelector('.seg-btn.active') as HTMLElement)?.dataset
      .mode as DetectionMode,
    threshold: {
      mixed: clamp01(parseFloat(els.thMixed.value)),
      ai: clamp01(parseFloat(els.thAi.value)),
    },
    api: {
      baseURL: els.baseURL.value.trim(),
      apiKey: els.apiKey.value.trim(),
      model: els.model.value.trim(),
      systemPrompt: els.systemPrompt.value,
      timeoutMs: 20000,
    } satisfies ApiConfig,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

async function load(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(stored.settings ?? {}),
    threshold: { ...DEFAULT_SETTINGS.threshold, ...(stored.settings?.threshold ?? {}) },
    api: { ...DEFAULT_SETTINGS.api, ...(stored.settings?.api ?? {}) },
  } as Settings;
  return merged;
}

async function save(settings: Settings) {
  await chrome.storage.local.set({ settings });
}

function flash(el: HTMLElement, text: string, kind: 'success' | 'error' = 'success') {
  el.textContent = text;
  el.classList.toggle('error', kind === 'error');
  el.classList.toggle('success', kind === 'success');
  setTimeout(() => {
    el.textContent = '';
    el.classList.remove('error', 'success');
  }, 4000);
}

function wire() {
  els.modeLocal.addEventListener('click', () => applyMode('local'));
  els.modeApi.addEventListener('click', () => applyMode('api'));

  els.preset.addEventListener('change', () => {
    const p = PRESETS[els.preset.value];
    if (!p || els.preset.value === 'custom') return;
    els.baseURL.value = p.baseURL;
    els.model.value = p.model;
    if (!p.needsKey) els.apiKey.value = '';
  });

  els.test.addEventListener('click', async () => {
    els.testResult.textContent = 'Testing…';
    els.testResult.classList.remove('error', 'success');
    const settings = readForm();
    try {
      const r = await chrome.runtime.sendMessage({
        type: 'LLM_TEST',
        config: settings.api,
      });
      if (r?.ok) {
        flash(els.testResult, `OK — ${r.sampleOutput}`, 'success');
      } else {
        flash(els.testResult, r?.error ?? 'Unknown error', 'error');
      }
    } catch (err) {
      flash(els.testResult, String((err as Error).message ?? err), 'error');
    }
  });

  els.save.addEventListener('click', async () => {
    const settings = readForm();
    await save(settings);
    flash(els.saveStatus, 'Saved. Reload Substack tab to apply.', 'success');
  });
}

async function init() {
  populatePresets();
  wire();
  render(await load());
}

void init();
