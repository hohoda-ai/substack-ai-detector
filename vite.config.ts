import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.config';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        // Expose main.ts as a standalone ES-module entry so the content
        // script loader can dynamic-import it via chrome.runtime.getURL.
        'src/content/main': 'src/content/main.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'src/content/main'
            ? 'src/content/main.js'
            : 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5174 },
  },
});
