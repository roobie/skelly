// Builds chunk meshes off the main thread. Buffers are transferred, not copied.

import { CHUNK, type Vec3 } from '../core/coords.ts';
import type { FencePostDefs } from '../core/fencePosts.ts';
import { buildMesh, type MeshData } from '../core/mesher.ts';
import { buildSkyResult } from '../core/skyTransport.ts';
import type { WireMeshes } from '../core/wireMesh.ts';
import { buildShape, shapeBuffers } from '../render/vehicleShape.ts';
import type { FromMesher, ToMesher } from './protocol.ts';

let wireMeshes: WireMeshes = [];
let fencePosts: FencePostDefs = [];
let colors: Uint8Array = new Uint8Array(0);
let patterns: Uint8Array = new Uint8Array(0);
let weatherable: Uint8Array = new Uint8Array(0);
let liquids: Uint8Array = new Uint8Array(0);

globalThis.onmessage = ({ data: msg }: MessageEvent<ToMesher>) => {
  if (msg.type === 'init') {
    ({ colors, patterns, weatherable, wireMeshes, liquids, fencePosts } = msg);
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
  const { key, version, padded, wide } = msg;
  const start = performance.now();
  const origin = key.split(',').map((coordinate) => Number(coordinate) * CHUNK) as Vec3;
  let mesh: MeshData;
  try {
    mesh = buildMesh(padded, colors, { patterns, wide, weatherable, wireMeshes, liquids, fencePosts, origin });
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
