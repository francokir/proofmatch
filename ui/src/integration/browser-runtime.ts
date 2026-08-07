import { Buffer } from 'buffer';
import browserProcess from 'process';

type BrowserGlobal = typeof globalThis & {
  Buffer?: typeof Buffer;
  process?: typeof browserProcess;
};

const browserGlobal = globalThis as BrowserGlobal;
browserGlobal.Buffer ??= Buffer;
browserGlobal.process ??= browserProcess;

const BrowserWebSocket = globalThis.WebSocket;

export { BrowserWebSocket as WebSocket };
export default BrowserWebSocket;
