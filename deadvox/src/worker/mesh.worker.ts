// Builds chunk meshes off the main thread. Buffers are transferred, not copied.

import { buildMesh } from '../core/mesher.ts';
import type { FromMesher, ToMesher } from './protocol.ts';

let colors: Uint8Array = new Uint8Array(0);

globalThis.onmessage = ({ data: msg }: MessageEvent<ToMesher>) => {
  if (msg.type === 'init') {
    ({ colors } = msg);
    return;
  }
  const { key, version, padded, origin } = msg;
  const start = performance.now();
  const mesh = buildMesh(padded, colors, origin);
  const reply: FromMesher = { type: 'mesh', key, version, mesh, ms: performance.now() - start };
  postMessage(reply, {
    transfer: [mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer],
  });
};
