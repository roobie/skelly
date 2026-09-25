// Builds chunk meshes off the main thread. Buffers are transferred, not copied.

import { buildMesh } from '../core/mesher.ts';
import type { FromMesher, ToMesher } from './protocol.ts';

let colors: Uint8Array = new Uint8Array(0);

self.onmessage = (e: MessageEvent<ToMesher>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    colors = msg.colors;
    return;
  }
  const mesh = buildMesh(msg.padded, colors, msg.origin);
  const reply: FromMesher = { type: 'mesh', key: msg.key, version: msg.version, mesh };
  postMessage(reply, {
    transfer: [mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer],
  });
};
