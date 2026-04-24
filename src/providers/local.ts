// Local RoBERTa classifier powered by @huggingface/transformers (ONNX).
// All inference happens in the browser; no text leaves the device.
import { env, pipeline } from '@huggingface/transformers';
import type { Provider, Settings, DetectionResult } from './types';
import { scoreToLabel } from './types';

env.allowLocalModels = false;
env.useBrowserCache = true;
// hf-mirror.com works in mainland China without gating; swap for
// 'https://huggingface.co' outside CN.
env.remoteHost = 'https://hf-mirror.com';

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');
  env.backends.onnx.wasm.numThreads = 1;
}

const MODEL_ID = 'onnx-community/roberta-base-openai-detector-ONNX';
const MAX_CHARS = 2000;

interface ClassificationRecord {
  label: string;
  score: number;
}
type Classifier = (
  text: string,
  options?: Record<string, unknown>
) => Promise<ClassificationRecord | ClassificationRecord[]>;

let pipelinePromise: Promise<Classifier> | null = null;
function loadClassifier(): Promise<Classifier> {
  if (!pipelinePromise) {
    pipelinePromise = pipeline('text-classification', MODEL_ID, {
      dtype: 'q8',
    }) as unknown as Promise<Classifier>;
  }
  return pipelinePromise;
}

export class LocalProvider implements Provider {
  constructor(private readonly thresholds: Settings['threshold']) {}

  preload(): void {
    void loadClassifier().catch((err) => {
      console.warn('[AI Detector] local model preload failed', err);
    });
  }

  async detect(text: string): Promise<DetectionResult> {
    const clean = text.trim().slice(0, MAX_CHARS);
    if (clean.length < 40) return { score: 0, label: 'human' };

    const classifier = await loadClassifier();
    const raw = await classifier(clean, { top_k: 2 });
    const results: ClassificationRecord[] = Array.isArray(raw) ? raw : [raw];

    const fake = results.find(
      (r) => r.label === 'Fake' || r.label === 'LABEL_0'
    );
    const score = fake ? Number(fake.score) : 0;

    return { score, label: scoreToLabel(score, this.thresholds) };
  }
}
