import type { MeshData } from '../core/mesher.ts';

export type ToMesher =
  | { type: 'init'; colors: Uint8Array }
  | { type: 'mesh'; key: string; version: number; origin: [number, number, number]; padded: Uint16Array };

export interface FromMesher {
  type: 'mesh';
  key: string;
  version: number;
  mesh: MeshData;
  /** Time spent in buildMesh, in milliseconds. */
  ms: number;
}
