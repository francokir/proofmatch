import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

const require = createRequire(import.meta.url);

/**
 * ZK material served to the browser, per contract.
 *
 * V1 and V2 publish differently named circuits, so both key sets can live under
 * one origin without colliding and a single `FetchZkConfigProvider` base URL
 * serves either contract. V2Q REUSES V2's circuit names (plus its own
 * attestQualification), so its assets are published under a `v2q/` prefix and
 * the facade points a second provider set at that base.
 */
const zkAssetSources = [
  {
    root: new URL('../contracts/managed/proofmatch-job/', import.meta.url),
    assets: ['keys/proveMatch.prover', 'keys/proveMatch.verifier', 'zkir/proveMatch.bzkir'],
  },
  {
    root: new URL('../contracts/managed/proofmatch-job-v2/', import.meta.url),
    assets: [
      'keys/lockPrivateBudget.prover',
      'keys/lockPrivateBudget.verifier',
      'zkir/lockPrivateBudget.bzkir',
      'keys/proveGuaranteedMatch.prover',
      'keys/proveGuaranteedMatch.verifier',
      'zkir/proveGuaranteedMatch.bzkir',
    ],
  },
  {
    root: new URL('../contracts/managed/proofmatch-job-v2q/', import.meta.url),
    prefix: 'v2q/',
    assets: [
      'keys/lockPrivateBudget.prover',
      'keys/lockPrivateBudget.verifier',
      'zkir/lockPrivateBudget.bzkir',
      'keys/proveGuaranteedMatch.prover',
      'keys/proveGuaranteedMatch.verifier',
      'zkir/proveGuaranteedMatch.bzkir',
      'keys/attestQualification.prover',
      'keys/attestQualification.verifier',
      'zkir/attestQualification.bzkir',
    ],
  },
] as const;

const zkAssetRoots = new Map<string, URL>(
  zkAssetSources.flatMap(({ root, assets, ...rest }) =>
    assets.map(
      (asset) => [`${'prefix' in rest ? rest.prefix : ''}${asset}`, new URL(asset, root)] as const,
    ),
  ),
);

function serveProofMatchZkAssets(): Plugin {
  return {
    name: 'proofmatch-zk-assets',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const assetPath = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1);
        const assetUrl = zkAssetRoots.get(assetPath);
        if (!assetUrl) {
          next();
          return;
        }
        try {
          response.setHeader('Content-Type', 'application/octet-stream');
          response.end(await readFile(assetUrl));
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      for (const [assetPath, assetUrl] of zkAssetRoots) {
        this.emitFile({
          type: 'asset',
          fileName: assetPath,
          source: await readFile(assetUrl),
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
        // cross-fetch hands out an unbound window.fetch, which throws
        // "Illegal invocation" from strict-mode ES modules. See the shim.
        find: /^cross-fetch$/,
        replacement: fileURLToPath(new URL('./src/integration/cross-fetch-browser.ts', import.meta.url)),
      },
      {
        find: '@proofmatch/browser-ui-api',
        replacement: fileURLToPath(new URL('../src/proofmatch/browser/ui-api.ts', import.meta.url)),
      },
      {
        find: '@proofmatch/browser-ui-contract',
        replacement: fileURLToPath(new URL('../src/proofmatch/browser/ui-contract.ts', import.meta.url)),
      },
      {
        find: '@proofmatch/v2-ui-api',
        replacement: fileURLToPath(new URL('../src/proofmatch-v2/browser/ui-api.ts', import.meta.url)),
      },
      {
        find: '@proofmatch/v2-ui-contract',
        replacement: fileURLToPath(new URL('../src/proofmatch-v2/browser/ui-contract.ts', import.meta.url)),
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
