import { array, check, type InferOutput, optional, pipe, strictObject } from 'valibot';
import { ItemScarcitySchema } from '../loot.ts';
import { PowerDeviceSchema, PowerTuningSchema } from '../powerContent.ts';
import { ActorFigureSchema, ActorSchema, actorAcidSpitMatchesAbility, actorRegionsMatchModel } from './actors.ts';
import { BlockMaterialSchema, BlockSchema, FootstepSoundSchema } from './blocks.ts';
import { BodyTuningSchema } from './body.ts';
import { CatalogueRowSchema } from './catalogueRows.ts';
import { CombatPolicySchema, RangedTuningSchema } from './combat.ts';
import { CompressionTuningSchema } from './compression.ts';
import { ControlSchema } from './controls.ts';
import { CursorSchema } from './cursors.ts';
import { DamageKindSchema } from './damageKinds.ts';
import { DayCycleSchema } from './dayCycle.ts';
import { FigureSchema } from './figures.ts';
import { FurnitureMaterialSchema, FurnitureSchema } from './furniture.ts';
import { GraphicsTuningSchema } from './graphics.ts';
import { InventoryTuningSchema } from './inventory.ts';
import {
  ItemSchema,
  LiquidSchema,
  MeleeClassSchema,
  type TreatmentSchema,
  VehicleBlueprintSchema,
  VehicleFinishSchema,
} from './items.ts';
import { CityBenchmarkSchema, type FixedLootOverride, MapPoolSchema, SiteLayoutSchema } from './layouts.ts';
import { LookDefaultsSchema } from './look.ts';
import { LootTableSchema } from './loot.ts';
import { type GunModelSchema, ItemWearSchema, ModelSchema, type SoundRecipeSchema, SoundSchema } from './models.ts';
import { PlayerSchema } from './player.ts';
import { Id } from './primitives.ts';
import { RecipeCategorySchema, RecipeSchema, RecipeTagSchema } from './recipes.ts';
import { SaveTuningSchema } from './saves.ts';
import { ScenarioSchema } from './scenarios.ts';
import { SenseSchema } from './senses.ts';
import { SiteGenerationSchema, type TreeCrownSchema } from './siteGeneration.ts';
import { SkillProgressionSchema, SkillSchema } from './skills.ts';
import { StartSchema } from './starts.ts';
import {
  type DoorLockSchema,
  type FixedLootItem,
  type KitAnchorSchema,
  type KitPortSchema,
  type KitRefSchema,
  MapAssemblySchema,
  MapPieceSchema,
  MapSiteSchema,
  MapStyleSchema,
  type StairSchema,
  type TemplateAccessSchema,
  TemplateSchema,
} from './templates.ts';
import { UiTuningSchema } from './ui.ts';
import { WeatheringSchema } from './weathering.ts';

// ---- files ----

/** Native schemas and section metadata live here, not in parallel loader/validator lists. */
const SECTION_DESCRIPTOR = {
  blocks: { schema: optional(array(BlockSchema)), label: 'blocks', order: 0 },
  blockMaterials: { schema: optional(array(BlockMaterialSchema)), label: 'block materials', order: 0.1 },
  footstepSounds: { schema: optional(array(FootstepSoundSchema)), label: 'footstep sounds', order: 0.2 },
  items: { schema: optional(array(ItemSchema)), label: 'items', order: 1 },
  itemEconomy: { schema: optional(array(ItemScarcitySchema)), label: 'item scarcity', order: 1.1 },
  liquids: { schema: optional(array(LiquidSchema)), label: 'liquids', order: 34 },
  furnitureMaterials: { schema: optional(array(FurnitureMaterialSchema)), label: 'furniture materials', order: 32 },
  vehicleFinishes: { schema: optional(array(VehicleFinishSchema)), label: 'vehicle finishes', order: 32.5 },
  vehicleBlueprints: { schema: optional(array(VehicleBlueprintSchema)), label: 'vehicle blueprints', order: 33 },
  furniture: { schema: optional(array(FurnitureSchema)), label: 'furniture', order: 2 },
  loot: { schema: optional(array(LootTableSchema)), label: 'loot tables', order: 4 },
  templates: { schema: optional(array(TemplateSchema)), label: 'templates', order: 5 },
  actors: {
    schema: optional(
      pipe(
        array(ActorSchema),
        check(
          (types) =>
            types.every((actor) => !actor.agent || (actor.attack !== undefined && actor.chaseMotion !== undefined)),
          'agent requires attack and chaseMotion',
        ),
        check(
          (types) => types.every((actor) => actor.model !== 'fused-mass' || actor.bodyScale !== undefined),
          'fused-mass must define bodyScale',
        ),
        check(
          (types) => types.every((actor) => (actor.model === 'fused-mass') === (actor.spawnEnvelope !== undefined)),
          'spawnEnvelope must be defined exactly on a fused-mass body',
        ),
        check(
          (types) => types.every((actor) => actor.model === 'fused-mass' || actor.carving === undefined),
          'only a fused-mass body may define carving',
        ),
        check(
          (types) => types.every((actor) => (actor.model === 'fused-mass') === (actor.downed === undefined)),
          'every type but fused-mass, which never lies downed, must define downed',
        ),
        check(
          (types) => types.every((actor) => (actor.model === 'fused-mass') === (actor.figureSeeds === undefined)),
          'every type but fused-mass, whose figure seed is fixed, must define figureSeeds',
        ),
        check(
          (types) =>
            types.every(
              (actor) =>
                !actor.attack || (actor.model === 'fused-mass') === (actor.attack.grabBandMetres === undefined),
            ),
          'every type but fused-mass, which strikes from its core, must define attack.grabBandMetres',
        ),
        check((types) => types.every(actorRegionsMatchModel), 'zombie region keys must match the model'),
        check((types) => types.every(actorAcidSpitMatchesAbility), 'acidSpit tunables must match the acidSpit ability'),
        check(
          (types) => types.every((actor) => (actor.model === 'acid') === (actor.acidBody !== undefined)),
          'acidBody must be defined exactly for the acid model',
        ),
      ),
    ),
    label: 'actor types',
    order: 6,
  },
  actorFigures: { schema: optional(array(ActorFigureSchema)), label: 'actor figures', order: 6.1 },
  figures: { schema: optional(array(FigureSchema)), label: 'figures', order: 3 },
  models: { schema: optional(array(ModelSchema)), label: 'models', order: 7 },
  itemWear: { schema: optional(array(ItemWearSchema)), label: 'item wear looks', order: 7.1 },
  sounds: { schema: optional(array(SoundSchema)), label: 'sound events', order: 8 },
  soundFamilies: { schema: optional(array(strictObject({ id: Id }))), label: 'sound families', order: 8 },
  damageKinds: { schema: optional(array(DamageKindSchema)), label: 'damage kinds', order: 8 },
  rangedTuning: { schema: optional(array(RangedTuningSchema)), label: 'ranged tuning', order: 8.1 },
  combatPolicy: { schema: optional(array(CombatPolicySchema)), label: 'combat policy', order: 8.2 },
  skills: { schema: optional(array(SkillSchema)), label: 'skills', order: 9 },
  skillProgression: { schema: optional(array(SkillProgressionSchema)), label: 'skill progression', order: 9 },
  recipes: { schema: optional(array(RecipeSchema)), label: 'recipes', order: 10 },
  recipeCategories: { schema: optional(array(RecipeCategorySchema)), label: 'recipe categories', order: 10.1 },
  recipeTags: { schema: optional(array(RecipeTagSchema)), label: 'recipe tags', order: 10.2 },
  layouts: { schema: optional(array(SiteLayoutSchema)), label: 'site layouts', order: 11 },
  catalogueRows: { schema: optional(array(CatalogueRowSchema)), label: 'catalogue rows', order: 11.1 },
  body: { schema: optional(array(BodyTuningSchema)), label: 'body tuning', order: 12 },
  senses: { schema: optional(array(SenseSchema)), label: 'sense tuning', order: 13 },
  player: { schema: optional(array(PlayerSchema)), label: 'player tuning', order: 13.5 },
  meleeClasses: { schema: optional(array(MeleeClassSchema)), label: 'melee classes', order: 14 },
  siteGeneration: { schema: optional(array(SiteGenerationSchema)), label: 'site generation', order: 15 },
  weathering: { schema: optional(array(WeatheringSchema)), label: 'weathering', order: 16 },
  inventory: { schema: optional(array(InventoryTuningSchema)), label: 'inventory tuning', order: 17 },
  saves: { schema: optional(array(SaveTuningSchema)), label: 'save tuning', order: 18 },
  compression: { schema: optional(array(CompressionTuningSchema)), label: 'compression tuning', order: 19 },
  ui: { schema: optional(array(UiTuningSchema)), label: 'UI tuning', order: 20 },
  cursors: { schema: optional(array(CursorSchema)), label: 'cursors', order: 20.1 },
  scenarios: { schema: optional(array(ScenarioSchema)), label: 'scenarios', order: 21 },
  starts: { schema: optional(array(StartSchema)), label: 'starts', order: 21.1 },
  cityBenchmarks: { schema: optional(array(CityBenchmarkSchema)), label: 'city benchmarks', order: 30 },
  controls: { schema: optional(array(ControlSchema)), label: 'default keys', order: 31 },
  graphics: { schema: optional(array(GraphicsTuningSchema)), label: 'graphics tuning', order: 22 },
  mapStyles: { schema: optional(array(MapStyleSchema)), label: 'map styles', order: 23 },
  mapPieces: { schema: optional(array(MapPieceSchema)), label: 'map pieces', order: 24 },
  mapAssemblies: { schema: optional(array(MapAssemblySchema)), label: 'map assemblies', order: 25 },
  mapSites: { schema: optional(array(MapSiteSchema)), label: 'map site recipes', order: 26 },
  mapPools: { schema: optional(array(MapPoolSchema)), label: 'map pools', order: 27 },
  look: { schema: optional(array(LookDefaultsSchema)), label: 'default look', order: 28 },
  powerDevices: { schema: optional(array(PowerDeviceSchema)), label: 'power devices', order: 32 },
  powerTuning: { schema: optional(array(PowerTuningSchema)), label: 'power tuning', order: 33 },
} as const;

type SectionSchemas = { [S in keyof typeof SECTION_DESCRIPTOR]: (typeof SECTION_DESCRIPTOR)[S]['schema'] };

const sectionSchemas = Object.fromEntries(
  Object.entries(SECTION_DESCRIPTOR).map(([section, descriptor]) => [section, descriptor.schema]),
) as SectionSchemas;

/** One content file: any declared section, each a list of definitions. */
export const ContentFileSchema = strictObject({ ...sectionSchemas, dayCycle: optional(DayCycleSchema) });

export type BlockDef = InferOutput<typeof BlockSchema>;

export type BlockMaterialDef = InferOutput<typeof BlockMaterialSchema>;

export type ItemDef = InferOutput<typeof ItemSchema>;

export type FurnitureDef = InferOutput<typeof FurnitureSchema>;

type LootTable = InferOutput<typeof LootTableSchema>;

export type LootEntry = LootTable['entries'][number];

export type TemplateDef = InferOutput<typeof TemplateSchema>;

export type MapPieceDef = InferOutput<typeof MapPieceSchema>;

export type MapAssemblyDef = InferOutput<typeof MapAssemblySchema>;

export type MapSiteDef = InferOutput<typeof MapSiteSchema>;

export type MapPoolDef = InferOutput<typeof MapPoolSchema>;

export type CityBenchmarkDef = InferOutput<typeof CityBenchmarkSchema>;

export type KitPort = InferOutput<typeof KitPortSchema>;

export type KitAnchor = InferOutput<typeof KitAnchorSchema>;

export type KitRef = InferOutput<typeof KitRefSchema>;

export type StairDef = InferOutput<typeof StairSchema>;

export type TemplateAccess = InferOutput<typeof TemplateAccessSchema>;

export type FixedLootItemDef = InferOutput<typeof FixedLootItem>;

export type SiteLayoutDef = InferOutput<typeof SiteLayoutSchema>;

export type ScenarioDef = InferOutput<typeof ScenarioSchema>;

export type FixedLootOverrideDef = InferOutput<typeof FixedLootOverride>;

export type DoorLockDef = InferOutput<typeof DoorLockSchema>;

export type ActorDef = InferOutput<typeof ActorSchema>;

export type FigureDef = InferOutput<typeof FigureSchema>;

export type ActorFigureDef = InferOutput<typeof ActorFigureSchema>;

export type GunModelDef = InferOutput<typeof GunModelSchema>;

export type ModelDef = InferOutput<typeof ModelSchema>;

export type VehicleFittingDef = InferOutput<typeof VehicleBlueprintSchema>['fittings'][number];

export type SoundDef = InferOutput<typeof SoundSchema>;

export type SoundRecipe = InferOutput<typeof SoundRecipeSchema>;

export type RecipeDef = InferOutput<typeof RecipeSchema>;

export type RecipeCategoryDef = InferOutput<typeof RecipeCategorySchema>;

export type MeleeClassDef = InferOutput<typeof MeleeClassSchema>;

export type BodyTuningDef = InferOutput<typeof BodyTuningSchema>;

export type InventoryTuningDef = InferOutput<typeof InventoryTuningSchema>;

export type TreatmentDef = InferOutput<typeof TreatmentSchema>;

export type CompressionCaps = InferOutput<typeof CompressionTuningSchema>['caps'];

export type WeatheringDef = InferOutput<typeof WeatheringSchema>;

export type SenseDef = InferOutput<typeof SenseSchema>;

export type PlayerDef = InferOutput<typeof PlayerSchema>;

export type GraphicsTuningDef = InferOutput<typeof GraphicsTuningSchema>;

export type LookDefaultsDef = InferOutput<typeof LookDefaultsSchema>;

export type TreeConeCrown = Extract<InferOutput<typeof TreeCrownSchema>, { kind: 'cone' }>;

export type DayCycleDef = InferOutput<typeof DayCycleSchema>;

export type SkillDef = InferOutput<typeof SkillSchema>;

export type ContentFile = InferOutput<typeof ContentFileSchema>;

export type ContentSection = keyof typeof SECTION_DESCRIPTOR;

/** Also rejects independently adding a schema section without its metadata. */
export const CONTENT_SECTIONS = SECTION_DESCRIPTOR satisfies Record<ContentSection, { label: string; order: number }>;

/** Order preserves the existing duplicate-id diagnostics independently of schema field order. */
export const CONTENT_SECTION_KEYS = (Object.keys(CONTENT_SECTIONS) as ContentSection[]).sort(
  (a, b) => CONTENT_SECTIONS[a].order - CONTENT_SECTIONS[b].order,
);
