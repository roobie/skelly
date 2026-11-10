import type { FencePostDefs } from '../../../engine/src/core/fencePosts.ts';
import type { MeshData } from '../../../engine/src/core/mesher.ts';
import type { SkySnapshot } from '../../../engine/src/core/skySnapshot.ts';
import type { SkyResult } from '../../../engine/src/core/skyTransport.ts';
import type { WireMeshes } from '../../../engine/src/core/wireMesh.ts';
import type { ShapeData } from '../../../engine/src/vehicles/shapeData.ts';

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

/** What a mesher reports back: a reply, or a failure that leaves its replies unusable. */
export interface MesherHandlers {
  message: (reply: FromMesher) => void;
  failure: (reason: string) => void;
}

/** One mesher, named without DOM types so the streamer needs no browser to schedule meshing. */
export interface MesherPort {
  post: (msg: ToMesher, transfer: readonly ArrayBuffer[]) => void;
  listen: (handlers: MesherHandlers) => void;
}

/** The meshers a streamer schedules across; the caller owns how many and how they run. */
export interface MesherSource {
  readonly count: number;
  create: () => MesherPort;
}
