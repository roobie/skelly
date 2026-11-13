export { placementOf } from './core/authoredPlacement.ts';
export { AuthoredSite } from './core/authoredSite.ts';
export {
  BlockEntities,
  type BlockEntity,
  type DoorOperation,
  type DoorPanelBox,
  doorBarBox,
  isBodyDoor,
  panelFor,
  poseKey,
  searchTime,
} from './core/blockEntities.ts';
export { CanonicalTerrain, installColumn } from './core/canonicalTerrain.ts';
export { Chunk } from './core/chunk.ts';
export { StressCity } from './core/city.ts';
export { CitySite } from './core/citySite.ts';
export { terrainSolid, worldMeleeBlocker, worldOpaque, worldSolid, worldSoundBlocking } from './core/collision.ts';
export { createColumnSupply } from './core/columnSupply.ts';
export { CHUNK, chunkKey, compassBearing, toChunk, toLocal, type Vec3, yawFromBearing } from './core/coords.ts';
export { DECAL_KINDS } from './core/decalKinds.ts';
export { Forest } from './core/forest.ts';
export {
  advanceFloorLockedPlacement,
  type FurnitureMover,
  type FurnitureSlideWay,
  floorLockedPlacement,
  furnitureMoveStamina,
  liftFurniture,
  movableRefusal,
  placeFurniture,
  placement,
  removalRefusal,
  removeFurniture,
  ruinFurniture,
  slidableFurniture,
  slideDestination,
  slideFurniture,
  spreadActorDrop,
  tipCarried,
  turnCarried,
} from './core/furnitureMove.ts';
export { GENERATED_SITES } from './core/generatedSites.ts';
export { climb, LadderHold } from './core/ladders.ts';
export { rotationOf } from './core/orientation.ts';
export { type PaperMapCoverage, paperMapBounds } from './core/paperMap.ts';
export {
  type Body,
  bodyOverlapsBlock,
  bodyOverlapsTerrain,
  CONTACT_SKIN,
  type PhysicsParams,
  stepBody,
} from './core/physics.ts';
export type { PublicCartographicFeature } from './core/publicCartography.ts';
export { raycast, type SolidAt } from './core/raycast.ts';
export { BLOCK_SIZE, chunksFor, makeScale, type Scale, WORLD_BOTTOM_M } from './core/scale.ts';
export { HORDE_MEMBERS, TEMPLATE_BLOCK_SIZE } from './core/settlementSpawns.ts';
export { siteGenerationOf, sitePalette, terrainShapeOf } from './core/sitePalette.ts';
export { type PlacedPowerDevice, type PoweredLight, placedPowerDevices, SitePower } from './core/sitePower.ts';
export { type SolidBricks, worldBricks } from './core/solidBricks.ts';
export { type BlockBox, type MetreBox, rasterize, stampChunk } from './core/structure.ts';
export { ownershipCell } from './core/templateOwnership.ts';
export {
  type Facing,
  footprint,
  type Placement,
  placedDecals,
  placedPoint,
  type VoxelProvenance,
} from './core/templates.ts';
export { createTerrainEvaluator, type TerrainEvaluator } from './core/terrainEvaluator.ts';
export type { SiteTerrainPlan, TerrainPlan } from './core/terrainPlan.ts';
export { isEnclosed, World } from './core/world.ts';
export {
  generateColumn,
  type Surface,
  type Terrain,
  type TerrainBlocks,
  type TerrainShape,
  terrainHeightMetres,
  worldGroundAt,
} from './core/worldgen.ts';
export { columnArrival } from './game/columnArrival.ts';
export { layoutVehicleQueries, registerLayoutVehicles } from './game/layoutVehicles.ts';
export type { StreamerStats } from './game/streamer.ts';
export {
  createTerrainService,
  type FromTerrain,
  type TerrainPort,
  type TerrainWorkerSource,
  type ToTerrain,
} from './game/terrainProtocol.ts';
export { createWorldSetup, playerStartFromWorld, siteForReviewMap, type WorldSetup } from './game/worldSetup.ts';
