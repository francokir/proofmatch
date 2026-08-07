import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

const proofMatchZkRoot = new URL('../contracts/managed/proofmatch-job/', import.meta.url);
const require = createRequire(import.meta.url);
const proofMatchZkAssets = [
  'keys/proveMatch.prover',
  'keys/proveMatch.verifier',
  'zkir/proveMatch.bzkir',
] as const;

function serveProofMatchZkAssets(): Plugin {
  return {
    name: 'proofmatch-zk-assets',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const assetPath = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1);
        if (!proofMatchZkAssets.includes(assetPath as typeof proofMatchZkAssets[number])) {
          next();
          return;
        }
        try {
          response.setHeader('Content-Type', 'application/octet-stream');
          response.end(await readFile(new URL(assetPath, proofMatchZkRoot)));
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      for (const assetPath of proofMatchZkAssets) {
        this.emitFile({
          type: 'asset',
          fileName: assetPath,
          source: await readFile(new URL(assetPath, proofMatchZkRoot)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait(), serveProofMatchZkAssets()],
  resolve: {
    alias: [
      { find: /^events$/, replacement: require.resolve('events/') },
      { find: /^assert$/, replacement: require.resolve('assert/') },
      {
        find: /^isomorphic-ws$/,
        replacement: fileURLToPath(new URL('./src/integration/browser-runtime.ts', import.meta.url)),
      },
      {
        find: '@proofmatch/browser-ui-api',
        replacement: fileURLToPath(new URL('../src/proofmatch/browser/ui-api.ts', import.meta.url)),
      },
      {
        find: '@proofmatch/browser-ui-contract',
        replacement: fileURLToPath(new URL('../src/proofmatch/browser/ui-contract.ts', import.meta.url)),
      },
    ],
  },
  server: {
    fs: { allow: ['..'] },
  },
  build: {
    target: 'esnext',
  },
});
