import type { FencePostDefs } from '../core/fencePosts.ts';
import type { MeshData } from '../core/mesher.ts';
import type { SkySnapshot } from '../core/skySnapshot.ts';
import type { SkyResult } from '../core/skyTransport.ts';

import type { WireMeshes } from '../core/wireMesh.ts';

export type ToMesher =
  | {
      type: 'init';
      colors: Uint8Array;
      patterns: Uint8Array;
      weatherable: Uint8Array;
      wireMeshes: WireMeshes;
      liquids: Uint8Array;
      fencePosts: FencePostDefs;
    }
  | { type: 'mesh'; key: string; version: number; padded: Uint16Array; wide: Uint8Array }
  | { type: 'sky'; input: SkySnapshot };

export type FromMesher = Meshed | { type: 'sky'; result: SkyResult; workerRealMs: number };

interface Meshed {
  type: 'mesh';
  key: string;
  version: number;
  mesh: MeshData;
  /** Time spent in buildMesh, in milliseconds. */
  ms: number;
}
