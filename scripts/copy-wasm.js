// Copy ONNX Runtime WebAssembly assets from @huggingface/transformers into
// public/wasm so the extension can load them locally (MV3-friendly).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const candidateSources = [
  join(root, 'node_modules/@huggingface/transformers/dist'),
  join(root, 'node_modules/onnxruntime-web/dist'),
];

const targetDir = join(root, 'public/wasm');
mkdirSync(targetDir, { recursive: true });

let copied = 0;
for (const src of candidateSources) {
  if (!existsSync(src)) continue;
  for (const file of readdirSync(src)) {
    if (/\.(wasm|mjs)$/.test(file)) {
      cpSync(join(src, file), join(targetDir, file));
      copied++;
    }
  }
}

if (copied === 0) {
  console.warn(
    '[copy-wasm] No WASM files found. Run `npm install` first, then rerun this script.'
  );
} else {
  console.log(`[copy-wasm] Copied ${copied} files to public/wasm.`);
}
