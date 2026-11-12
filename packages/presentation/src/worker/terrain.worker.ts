// Computes terrain columns ahead of the main thread's admission. Arrays are transferred, not copied.

import { createTerrainService, type ToTerrain } from '@skelly/engine/world';

const serve = createTerrainService((reply, transfer) => postMessage(reply, { transfer }));

globalThis.onmessage = ({ data }: MessageEvent<ToTerrain>) => serve(data);
