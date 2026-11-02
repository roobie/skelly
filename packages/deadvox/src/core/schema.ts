// biome-ignore-all lint/performance/noBarrelFile: The content boundary exposes one schema contract while section modules share native validators.
export { BLOCK_PATTERNS } from './schema/blocks.ts';
export { DayCycleSchema } from './schema/dayCycle.ts';
export type {
  ArmRigDef,
  ArmSegment,
  FigureJoint,
  FigureLimb,
  HandPoseDef,
  HeldPosesDef,
  LegSegment,
} from './schema/figures.ts';
export { ARM_SEGMENTS, FIGURE_LIMB_JOINTS, FIGURE_LIMBS, LEG_SEGMENTS } from './schema/figures.ts';
export type {
  BlockDef,
  BlockMaterialDef,
  BodyTuningDef,
  CityBenchmarkDef,
  CompressionCaps,
  ContentFile,
  ContentSection,
  DayCycleDef,
  DoorLockDef,
  FigureDef,
  FixedLootItemDef,
  FixedLootOverrideDef,
  FurnitureDef,
  GraphicsTuningDef,
  GunModelDef,
  HandlingRangeDef,
  InventoryTuningDef,
  ItemDef,
  KitAnchor,
  KitPort,
  KitRef,
  LightPracticeDef,
  LookDefaultsDef,
  LootEntry,
  MapAssemblyDef,
  MapPieceDef,
  MapPoolDef,
  MapSiteDef,
  MeleeClassDef,
  ModelDef,
  PlayerDef,
  RecipeCategoryDef,
  RecipeDef,
  ScenarioDef,
  SenseDef,
  SiteLayoutDef,
  SkillDef,
  SoundDef,
  SoundRecipe,
  StairDef,
  TemplateAccess,
  TemplateDef,
  TreatmentDef,
  TreeConeCrown,
  VehicleFittingDef,
  WeatheringDef,
  ZombieDef,
} from './schema/files.ts';
export { CONTENT_SECTION_KEYS, CONTENT_SECTIONS, ContentFileSchema } from './schema/files.ts';
export type {
  BeamSpill,
  LiquidContents,
  MeleeCharge,
  NightVision,
  RoundFeedPoseTuning,
  VehicleCapability,
  WearSlot,
} from './schema/items.ts';
export { BeamSpillSchema, HELD_DISPLAY_KIND, PILE_DISPLAY_KIND, VEHICLE_ADDON_FACES } from './schema/items.ts';
export type { PerimeterCrossingDef } from './schema/layouts.ts';
export type { CompassDial, HandsModelDef } from './schema/models.ts';
export { ModelSchema } from './schema/models.ts';
export type { EventRuleDef } from './schema/scenarios.ts';
export type { DecalDef, GroundLootSupply } from './schema/templates.ts';
export { DecalSchema } from './schema/templates.ts';
export type { ScreenText } from './schema/ui.ts';
export type { ShamblerHitRegion, ZombieHitRegion, ZombieRegion, ZombieRegions } from './schema/zombies.ts';
