import type { FencePostDefs } from '../core/fencePosts.ts';
import type { MeshData } from '../core/mesher.ts';
import type { SkySnapshot } from '../core/skySnapshot.ts';
import type { SkyResult } from '../core/skyTransport.ts';
import type { WireMeshes } from '../core/wireMesh.ts';
import type { ShapeData } from '../render/vehicleShape.ts';

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
  | { type: 'sky'; id: number; input: SkySnapshot }
  | { type: 'vehicle'; key: string; blueprint: string; removed: readonly string[] };

export type FromMesher =
  | Meshed
  | { type: 'meshFailed'; key: string; message: string }
  | { type: 'sky'; id: number; result: SkyResult; workerRealMs: number }
  | { type: 'vehicle'; key: string; shape: ShapeData };

interface Meshed {
  type: 'mesh';
  key: string;
  version: number;
  mesh: MeshData;
  /** Time spent in buildMesh, in milliseconds. */
  ms: number;
}
