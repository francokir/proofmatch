import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: {
      '@proofmatch/browser-ui-api': fileURLToPath(new URL('../src/proofmatch/browser/ui-api.ts', import.meta.url)),
      '@proofmatch/browser-ui-contract': fileURLToPath(new URL('../src/proofmatch/browser/ui-contract.ts', import.meta.url)),
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
  build: {
    target: 'esnext',
  },
});
