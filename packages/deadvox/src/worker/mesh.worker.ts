// Builds chunk meshes off the main thread. Buffers are transferred, not copied.

import { CHUNK, type Vec3 } from '../core/coords.ts';
import type { FencePostDefs } from '../core/fencePosts.ts';
import { buildMesh } from '../core/mesher.ts';
import { buildSkyResult } from '../core/skyTransport.ts';
import type { WireMeshes } from '../core/wireMesh.ts';
import type { FromMesher, ToMesher } from './protocol.ts';

let wireMeshes: WireMeshes = [];
let fencePosts: FencePostDefs = [];
let colors: Uint8Array = new Uint8Array(0);
let patterns: Uint8Array = new Uint8Array(0);
let weatherable: Uint8Array = new Uint8Array(0);

globalThis.onmessage = ({ data: msg }: MessageEvent<ToMesher>) => {
  if (msg.type === 'init') {
    ({ colors, patterns, weatherable, wireMeshes, fencePosts } = msg);
    return;
  }
  if (msg.type === 'sky') {
    const start = performance.now();
    const result = buildSkyResult(msg.input);
    const reply: FromMesher = { type: 'sky', result, workerRealMs: performance.now() - start };
    postMessage(reply, {
      transfer: [
        result.heights.buffer,
        ...(result.volume ? [result.volume.light.buffer, result.volume.unfurnished.buffer] : []),
      ],
    });
    return;
  }
  const { key, version, padded, wide } = msg;
  const start = performance.now();
  const origin = key.split(',').map((coordinate) => Number(coordinate) * CHUNK) as Vec3;
  const mesh = buildMesh(padded, colors, { patterns, wide, weatherable, wireMeshes, fencePosts, origin });
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
