export type { ColumnReveal } from './core/columnReveal.ts';
export { revealedColumns } from './core/columnReveal.ts';
export type { FencePostDefs } from './core/fencePosts.ts';
export { buildMesh, type MeshData } from './core/mesher.ts';
export {
  blockLiquids,
  blockPatterns,
  blockWeatherability,
  extractPadded,
  extractWide,
  type Neighbourhood,
  paddedFrom,
  wideFrom,
} from './core/meshInput.ts';
export type { WireMeshes } from './core/wireMesh.ts';
export type {
  FromMesher,
  MesherInit,
  MesherPort,
  MesherSource,
  MeshRequest,
  ToMesher,
} from './game/mesherProtocol.ts';
export { buildRequestedMesh } from './game/meshRequest.ts';
