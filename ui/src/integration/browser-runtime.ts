import { Buffer } from 'buffer';

type BrowserGlobal = typeof globalThis & { Buffer?: typeof Buffer };

(globalThis as BrowserGlobal).Buffer ??= Buffer;

const BrowserWebSocket = globalThis.WebSocket;

export { BrowserWebSocket as WebSocket };
export default BrowserWebSocket;
