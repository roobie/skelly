// Runs a browser module worker file on a Node worker thread, with the two globals such a file uses.
import { parentPort, workerData } from 'node:worker_threads';

globalThis.postMessage = (message, options) => parentPort.postMessage(message, options?.transfer ?? []);
await import(workerData.entry);
// A port queues messages until it has a listener, so none is lost while the module loads.
parentPort.on('message', (data) => globalThis.onmessage({ data }));
