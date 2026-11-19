// One half-metre ASCII placement authority for authored-site stamping and spawn validation.
import { buildingBounds } from './authoredTerrain.mjs';
import type { Registry, TemplateDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { LootContext } from './loot.ts';
import type { MapAssemblyDef, SiteLayoutDef } from './schema.ts';
import { TEMPLATE_BLOCK_SIZE } from './settlementSpawns.ts';
import type { Rect } from './site.ts';
import {
  type AssemblyContext,
  compileAssembly,
  compileTemplate,
  type Placement,
  stackTemplate,
  type Turn,
} from './templates.ts';

type LayoutBuilding = SiteLayoutDef['buildings'][number];

export type BuildingSource =
  | { readonly kind: 'template'; readonly definition: TemplateDef }
  | { readonly kind: 'assembly'; readonly definition: MapAssemblyDef };

/** The seed and stable identity an assembly's slot alternatives resolve from. */
export type BuildingSite = Pick<AssemblyContext, 'seed' | 'siteId'>;

export const blocks = (position: readonly number[]): Vec3 =>
  position.map((value) => value / TEMPLATE_BLOCK_SIZE) as Vec3;

export const layoutBuildingSite = (seed: number, layoutId: string, index: number): BuildingSite => ({
  seed,
  siteId: `layout:${layoutId}:building:${index}`,
});

/** What a layout building's id names; nothing when it names neither, or both a template and an assembly. */
export const buildingSource = (registry: Registry, { template: id }: LayoutBuilding): BuildingSource | undefined => {
  const template = registry.templates.get(id);
  const assembly = registry.mapAssemblies.get(id);
  if (template && assembly) {
    return undefined;
  }
  if (template) {
    return { kind: 'template', definition: template };
  }
  return assembly && { kind: 'assembly', definition: assembly };
};

const requiredSource = (registry: Registry, building: LayoutBuilding): BuildingSource => {
  const source = buildingSource(registry, building);
  if (!source) {
    throw new Error(`Missing or ambiguous layout building template/assembly "${building.template}"`);
  }
  return source;
};

/** The building's footprint in metres; every alternative of an assembly keeps its envelope. */
export const buildingFootprint = (registry: Registry, building: LayoutBuilding): Rect =>
  buildingBounds(building, requiredSource(registry, building).definition.size);

/**
 * A layout building's placement. A path without a world seed resolves assembly alternatives at seed 0, which the slot
 * contract allows because every alternative keeps the same reserved circulation, support and anchors.
 */
export const placementOf = (
  registry: Registry,
  building: LayoutBuilding,
  siteContext?: LootContext,
  site: BuildingSite = { seed: 0, siteId: building.template },
): Placement => {
  const source = requiredSource(registry, building);
  const template =
    source.kind === 'assembly'
      ? compileAssembly(registry, source.definition, { ...site, ...(building.style ? { style: building.style } : {}) })
      : stackTemplate(compileTemplate(registry, source.definition), building.storeys ?? 1);
  const origin = blocks(building.position);
  origin[1] -= template.groundLayer ?? 0;
  const lootContext = building.lootContext ?? {
    usage: template.lootContext.usage,
    tier: siteContext?.tier ?? template.lootContext.tier,
  };
  return { template, origin, turn: (building.rotation / 90) as Turn, lootContext };
};
