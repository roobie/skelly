// Builds chunk meshes off the main thread. Buffers are transferred, not copied.

import type { FromMesher, MesherInit, ToMesher } from '@skelly/engine/mesh';
import { buildRequestedMesh, type MeshData } from '@skelly/engine/mesh';
import { buildSkyResult } from '@skelly/engine/sky';
import { buildShape, shapeBuffers } from '../render/vehicleShape.ts';

let init: MesherInit | undefined;

globalThis.onmessage = ({ data: msg }: MessageEvent<ToMesher>) => {
  if (msg.type === 'init') {
    init = msg;
    return;
  }
  if (msg.type === 'sky') {
    const start = performance.now();
    const result = buildSkyResult(msg.input);
    const reply: FromMesher = { type: 'sky', id: msg.id, result, workerRealMs: performance.now() - start };
    postMessage(reply, {
      transfer: [
        result.heights.buffer,
        ...(result.volume ? [result.volume.light.buffer, result.volume.unfurnished.buffer] : []),
      ],
    });
    return;
  }
  if (msg.type === 'vehicle') {
    const shape = buildShape(msg.blueprint, msg.removed);
    const reply: FromMesher = { type: 'vehicle', key: msg.key, shape };
    postMessage(reply, { transfer: shapeBuffers(shape) });
    return;
  }
  const { key, version } = msg;
  const start = performance.now();
  let mesh: MeshData;
  try {
    if (!init) {
      throw new Error('Mesh request before init');
    }
    mesh = buildRequestedMesh(init, msg);
  } catch (error) {
    // An uncaught throw reaches the owner without the key, which would then wait on it forever.
    const failed: FromMesher = {
      type: 'meshFailed',
      key,
      message: error instanceof Error ? error.message : String(error),
    };
    postMessage(failed);
    return;
  }
  const reply: FromMesher = { type: 'mesh', key, version, mesh, ms: performance.now() - start };
  postMessage(reply, {
    transfer: [
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.colors.buffer,
      mesh.patterns.buffer,
      mesh.weatherable.buffer,
      mesh.occlusion.buffer,
      mesh.indices.buffer,
    ],
  });
};
