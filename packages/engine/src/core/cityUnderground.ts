import type { lotRect } from './cityLots.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { ScenarioDef } from './schema.ts';
import { rectsOverlap } from './site.ts';
import { footprint, type Placement, placedBlockAt } from './templates.ts';

export type Underground = NonNullable<ScenarioDef['city']['underground']>[number];
export interface PlannedUnderground {
  readonly definition: Underground;
  readonly placement: Placement;
}
type Issue = [string, string];
type Rect = ReturnType<typeof lotRect>;

const frozen = (definition: Underground): Underground => {
  const copy = structuredClone(definition);
  Object.freeze(copy.position);
  for (const list of [copy.mouths, copy.ports]) {
    for (const entry of list) {
      for (const value of Object.values(entry)) {
        Object.freeze(value);
      }
      Object.freeze(entry);
    }
    Object.freeze(list);
  }
  return Object.freeze(copy);
};

const placedRect = (placement: Placement): Rect => {
  const [width, depth] = footprint(placement);
  return {
    x0: placement.origin[0],
    z0: placement.origin[2],
    x1: placement.origin[0] + width,
    z1: placement.origin[2] + depth,
  };
};

export const cityUndergroundIssues = (registry: Registry, city: ScenarioDef['city'], bounds: Rect): Issue[] => {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  for (const [index, element] of (city.underground ?? []).entries()) {
    const path = `.city.underground[${index}]`;
    if (ids.has(element.id)) {
      issues.push([`${path}.id`, 'underground ids must be unique']);
    }
    ids.add(element.id);
    const assembly = registry.mapAssemblies.get(element.assembly);
    if (!assembly?.access) {
      issues.push([`${path}.assembly`, 'underground needs a known assembly with a ground storey']);
      continue;
    }
    const [x, z] = element.position;
    const [width, depth] =
      element.turn % 2 === 0 ? [assembly.size[0], assembly.size[2]] : [assembly.size[2], assembly.size[0]];
    if (x < bounds.x0 || z < bounds.z0 || x + width > bounds.x1 || z + depth > bounds.z1) {
      issues.push([path, 'underground must stay inside the containment bounds']);
    }
  }
  return issues;
};

/** Underground cells are checked in three dimensions: a corridor may pass under a building but not through it. */
const overlapIssue = (element: Placement, others: readonly Placement[]): string | undefined => {
  const rect = placedRect(element);
  const [width, depth] = footprint(element);
  const near = others.filter((other) => rectsOverlap(rect, placedRect(other)));
  const [, bottom] = element.origin;
  const [, height] = element.template.size;
  for (let y = bottom; y < bottom + height; y++) {
    for (let z = rect.z0; z < rect.z0 + depth; z++) {
      for (let x = rect.x0; x < rect.x0 + width; x++) {
        const cell: Vec3 = [x, y, z];
        if (placedBlockAt(element, cell) === undefined) {
          continue;
        }
        const other = near.find((candidate) => placedBlockAt(candidate, cell) !== undefined);
        if (other) {
          return `${element.template.id} and ${other.template.id} both own ${cell.join(',')}`;
        }
      }
    }
  }
  return undefined;
};

export const placeUnderground = (
  city: Pick<ScenarioDef['city'], 'underground'>,
  {
    floor,
    compiled,
    placements,
  }: {
    floor: number;
    compiled: (ref: { id: string }, storeys: number, siteId: string) => Placement['template'];
    placements: readonly Placement[];
  },
): readonly PlannedUnderground[] => {
  const planned: PlannedUnderground[] = [];
  for (const definition of city.underground ?? []) {
    const template = compiled({ id: definition.assembly }, 1, `city:underground:${definition.id}`);
    const origin: Vec3 = [definition.position[0], floor - (template.groundLayer ?? 0), definition.position[1]];
    const placement: Placement = { template, turn: definition.turn, origin };
    const issue = overlapIssue(placement, [...placements, ...planned.map((element) => element.placement)]);
    if (issue) {
      throw new Error(`Underground "${definition.id}" overlaps the city: ${issue}`);
    }
    planned.push(Object.freeze({ definition: frozen(definition), placement }));
  }
  return Object.freeze(planned);
};
