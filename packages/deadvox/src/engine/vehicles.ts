export {
  copyVehicleWorkPlacement,
  VehicleInstances,
  type VehicleWorkPlacement,
  type VehicleWorkTarget,
  vehicleSiteName,
} from '../core/vehicleInstances.ts';
export { projectVehicleParts, type VehiclePartProjection } from '../core/vehicleProjection.ts';
export { APC } from '../vehicles/apc.ts';
export { BOX_VAN } from '../vehicles/boxVan.ts';
export { BLUEPRINTS, CATALOGUE } from '../vehicles/catalogue.ts';
export { MATERIALS } from '../vehicles/materials.ts';
export {
  addFitting,
  type Blueprint,
  type Fitting,
  fittingById,
  isClearMaterial,
  latticeVoxels,
  type MassReport,
  measure,
  newInstance,
  noiseRadius,
  PART_CELL,
  PART_LAYERS,
  type Paint,
  type PartLayer,
  PartLibrary,
  partTypeOf,
  removeFitting,
  type VehicleInstance,
  VOXEL,
  VOXELS_PER_CELL,
} from '../vehicles/model.ts';
export { MOTORBIKE } from '../vehicles/motorbike.ts';
export { PICKUP } from '../vehicles/pickup.ts';
export { RANGE_ROVER, STRIPPED_REMOVED, wheel } from '../vehicles/rangeRover.ts';
export { SEDAN } from '../vehicles/sedan.ts';
export type { PartData, ShapeData } from '../vehicles/shapeData.ts';
export { fittedGrid } from '../vehicles/solid.ts';
export {
  GLASS,
  gridBounds,
  keyVoxel,
  type MeshBuffers,
  meshGrid,
  quadColors,
  type Rgb,
  type VoxelGrid,
  voxelKey,
} from '../vehicles/voxels.ts';
export { fittingWear, type WearSite, wearGrid, wearKey, wearPalette } from '../vehicles/wear.ts';
