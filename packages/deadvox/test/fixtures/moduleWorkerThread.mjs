// Runs a browser module worker file on a Node worker thread, with the two globals such a file uses.
import { parentPort, workerData } from 'node:worker_threads';

/**
 * @typedef {object} ModuleWorkerScope
 * @property {(message: unknown, options?: { transfer?: import('node:worker_threads').Transferable[] }) => void} postMessage
 * @property {(event: { data: unknown }) => void} onmessage set by the worker file when it loads
 */

if (!parentPort) {
  throw new Error('moduleWorkerThread runs only on a worker thread');
}
const port = parentPort;
const scope = /** @type {ModuleWorkerScope} */ (/** @type {unknown} */ (globalThis));
scope.postMessage = (message, options) => port.postMessage(message, options?.transfer ?? []);
await import(workerData.entry);
// A port queues messages until it has a listener, so none is lost while the module loads.
port.on('message', (data) => scope.onmessage({ data }));
