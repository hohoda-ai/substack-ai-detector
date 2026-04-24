import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Substack AI Detector',
  version: pkg.version,
  description: pkg.description,
  icons: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Substack AI Detector',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  permissions: ['storage', 'declarativeNetRequest'],
  host_permissions: [
    '*://*.substack.com/*',
    'https://huggingface.co/*',
    'https://cdn-lfs.huggingface.co/*',
    'https://hf-mirror.com/*',
    // OpenAI-compatible endpoints
    'https://api.openai.com/*',
    'https://api.anthropic.com/*',
    'https://api.deepseek.com/*',
    'https://openrouter.ai/*',
    // Local LLM servers
    'http://localhost/*',
    'http://127.0.0.1/*',
    'http://localhost:*/*',
    'http://127.0.0.1:*/*',
  ],
  optional_host_permissions: ['<all_urls>'],
  declarative_net_request: {
    rule_resources: [
      {
        id: 'cors_rules',
        enabled: true,
        path: 'rules.json',
      },
    ],
  },
  content_scripts: [
    {
      matches: ['*://*.substack.com/*', '*://substack.com/*'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: [
        'wasm/*.wasm',
        'wasm/*.mjs',
        'assets/*',
        'src/content/main.js',
      ],
      matches: ['*://*.substack.com/*', '*://substack.com/*'],
    },
  ],
});
