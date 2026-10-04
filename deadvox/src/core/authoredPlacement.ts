// One half-metre ASCII placement authority for authored-site stamping and spawn validation.
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { HAMLET_BLOCK_SIZE } from './hamlet.ts';
import type { SiteLayoutDef } from './schema.ts';
import { compileTemplate, type Placement, stackTemplate, type Turn } from './templates.ts';

export const blocks = (position: readonly number[]): Vec3 => position.map((value) => value / HAMLET_BLOCK_SIZE) as Vec3;

export const placementOf = (registry: Registry, building: SiteLayoutDef['buildings'][number]): Placement => ({
  template: stackTemplate(compileTemplate(registry, registry.templates.get(building.template)!), building.storeys ?? 1),
  origin: blocks(building.position),
  turn: (building.rotation / 90) as Turn,
});
