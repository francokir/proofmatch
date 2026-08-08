import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  describeInjectedWallets,
  findLaceInitialApi,
  waitForLaceInitialApi,
} from '../src/proofmatch/browser/lace';

/**
 * Minimal stand-in for what an extension puts on `window.midnight`.
 *
 * Only the four public identification fields matter for detection, so the fake
 * carries nothing else — if detection ever started needing more, these tests
 * would fail rather than silently pass against a richer real object.
 */
function fakeWindow(midnight?: Record<string, unknown>): Window {
  return { midnight } as unknown as Window;
}

const laceV4 = { apiVersion: '4.0.1', name: 'Lace', rdns: 'io.lace.midnight', connect: async () => ({}) };
const laceV3 = { apiVersion: '3.2.0', name: 'Lace', rdns: 'io.lace.midnight', connect: async () => ({}) };
const otherV4 = { apiVersion: '4.0.0', name: 'Some Other Wallet', rdns: 'com.example.wallet', connect: async () => ({}) };

describe('Lace detection', () => {
  it('finds the mnLace connector when it speaks API v4', () => {
    assert.equal(findLaceInitialApi(fakeWindow({ mnLace: laceV4 })), laceV4);
  });

  it('reports nothing when window.midnight is absent', () => {
    assert.equal(findLaceInitialApi(fakeWindow(undefined)), undefined);
  });

  it('reports nothing when window.midnight is empty', () => {
    assert.equal(findLaceInitialApi(fakeWindow({})), undefined);
  });

  it('rejects a Lace that speaks an older major version', () => {
    // The adapter targets DApp Connector v4. Accepting v3 here would let the
    // app fail later, deep inside a call whose shape it cannot rely on.
    assert.equal(findLaceInitialApi(fakeWindow({ mnLace: laceV3 })), undefined);
  });

  it('ignores a v4 wallet that is not Lace', () => {
    assert.equal(findLaceInitialApi(fakeWindow({ someWallet: otherV4 })), undefined);
  });

  it('falls back to a non-mnLace key when that entry is a v4 Lace', () => {
    assert.equal(findLaceInitialApi(fakeWindow({ laceMidnight: laceV4 })), laceV4);
  });

  it('finds the real Lace build, which registers under a UUID key', () => {
    // Observed in Chrome with Lace installed: the connector is NOT under
    // `mnLace`, it is under a random UUID, and identifies itself through
    // rdns/name. Keying detection on `mnLace` alone would miss it entirely.
    const realLace = { apiVersion: '4.0.1', name: 'lace', rdns: 'io.lace.wallet', connect: async () => ({}) };
    const wallets = { '4c39fc0a-d706-4bdd-b94f-bcf953d354b2': realLace };
    assert.equal(findLaceInitialApi(fakeWindow(wallets)), realLace);
  });

  it('survives a malformed neighbour and still finds the good Lace', () => {
    // `window.midnight` is third-party territory. A junk entry used to throw
    // while reading `apiVersion`, which hid a perfectly usable wallet.
    const wallets = { broken: {}, alsoBroken: { apiVersion: 4 }, mnLace: laceV4 };
    assert.equal(findLaceInitialApi(fakeWindow(wallets)), laceV4);
  });
});

describe('injected wallet diagnostics', () => {
  it('lists public metadata for every injected connector', () => {
    const info = describeInjectedWallets(fakeWindow({ mnLace: laceV4, someWallet: otherV4 }));
    assert.deepEqual(info, [
      { key: 'mnLace', name: 'Lace', rdns: 'io.lace.midnight', apiVersion: '4.0.1', compatible: true },
      { key: 'someWallet', name: 'Some Other Wallet', rdns: 'com.example.wallet', apiVersion: '4.0.0', compatible: true },
    ]);
  });

  it('marks an older connector as incompatible instead of hiding it', () => {
    const [info] = describeInjectedWallets(fakeWindow({ mnLace: laceV3 }));
    assert.equal(info.apiVersion, '3.2.0');
    assert.equal(info.compatible, false);
  });

  it('never copies anything beyond the four public fields', () => {
    // A wallet object may carry callable API surface; diagnostics must not
    // forward it anywhere it could be logged or rendered.
    const nosy = { ...laceV4, getShieldedAddresses: async () => 'secret-ish' };
    const [info] = describeInjectedWallets(fakeWindow({ mnLace: nosy }));
    assert.deepEqual(Object.keys(info).sort(), ['apiVersion', 'compatible', 'key', 'name', 'rdns']);
  });

  it('returns an empty list when nothing is injected', () => {
    assert.deepEqual(describeInjectedWallets(fakeWindow(undefined)), []);
  });
});

describe('injection race', () => {
  it('finds Lace when the extension injects after the app mounts', async () => {
    const windowObject = fakeWindow(undefined);
    setTimeout(() => {
      (windowObject as unknown as { midnight: unknown }).midnight = { mnLace: laceV4 };
    }, 250);
    assert.equal(await waitForLaceInitialApi(windowObject, 2_000), laceV4);
  });

  it('gives up after the timeout when nothing is ever injected', async () => {
    const startedAt = Date.now();
    assert.equal(await waitForLaceInitialApi(fakeWindow(undefined), 300), undefined);
    // Proves it actually waited rather than returning on the first read: a
    // single-shot check would be indistinguishable from this without it.
    assert.ok(Date.now() - startedAt >= 250, 'should keep polling until the deadline');
  });
});
