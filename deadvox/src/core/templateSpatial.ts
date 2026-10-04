// Static spatial acceptance, not recipe closure and not runtime navigation. Doors may be opened.
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { StairDef } from './schema.ts';
import { planFlight, STAIR_HEADROOM } from './stairFlight.ts';
import type { CompiledTemplate } from './templates.ts';

const BODY_HEIGHT = 3.6; // 1.8 m player bounds also contain the 1.7 m shambler; templates use 0.5 m blocks.
const BODY_HALF_WIDTH = 0.6;
export type SpatialIssue = [string, string];
const key = (pos: Vec3): string => pos.join(',');

class TemplateSpace {
  readonly registry: Registry;
  readonly template: CompiledTemplate;
  readonly solids: Set<number>;
  constructor(registry: Registry, template: CompiledTemplate) {
    this.registry = registry;
    this.template = template;
    this.solids = new Set(registry.blocks.flatMap((block, index) => (block.solid ? [index] : [])));
  }
  terrain(x: number, y: number, z: number): boolean {
    const [sx, sy, sz] = this.template.size;
    return (
      x < 0 ||
      y < 0 ||
      z < 0 ||
      x >= sx ||
      y >= sy ||
      z >= sz ||
      this.solids.has(this.template.blocks[x + sx * (z + sz * y)]!)
    );
  }
  furnitureStops(id: string, doorsOpen: boolean): boolean {
    const def = this.registry.furniture.get(id)!;
    return def.door ? !doorsOpen : def.solid !== false;
  }
  occupied(x: number, y: number, z: number, doorsOpen: boolean): boolean {
    return (
      this.terrain(x, y, z) ||
      this.template.pieces.some(
        (piece) =>
          this.furnitureStops(piece.furniture, doorsOpen) &&
          x >= piece.pos[0] &&
          x < piece.pos[0] + piece.size[0] &&
          y >= piece.pos[1] &&
          y < piece.pos[1] + piece.size[1] &&
          z >= piece.pos[2] &&
          z < piece.pos[2] + piece.size[2],
      )
    );
  }
  clear([x, feet, z]: Vec3): boolean {
    for (let y = feet; y < Math.ceil(feet + BODY_HEIGHT); y++) {
      for (let bz = Math.floor(z - BODY_HALF_WIDTH); bz < Math.ceil(z + BODY_HALF_WIDTH); bz++) {
        for (let bx = Math.floor(x - BODY_HALF_WIDTH); bx < Math.ceil(x + BODY_HALF_WIDTH); bx++) {
          if (this.occupied(bx, y, bz, true)) {
            return false;
          }
        }
      }
    }
    return true;
  }
  standing(pos: Vec3): boolean {
    const [x, feet, z] = pos;
    if (!this.clear(pos)) {
      return false;
    }
    for (let bz = Math.floor(z - BODY_HALF_WIDTH); bz < Math.ceil(z + BODY_HALF_WIDTH); bz++) {
      for (let bx = Math.floor(x - BODY_HALF_WIDTH); bx < Math.ceil(x + BODY_HALF_WIDTH); bx++) {
        if (this.occupied(bx, feet - 1, bz, true)) {
          return true;
        }
      }
    }
    return false;
  }
  flightIssues(stair: StairDef, index: number): SpatialIssue[] {
    const floors = new Map(this.template.access!.storeys.map((floor) => [floor.id, floor.floor]));
    const path = `.access.stairs[${index}]`;
    const plan = planFlight(stair, this.template.size);
    if (
      !plan ||
      floors.get(stair.from) !== stair.lower[1] ||
      floors.get(stair.to) !== stair.upper[1] ||
      !this.solids.has(this.registry.blockIds.get(stair.block) ?? -1)
    ) {
      return [
        [
          path,
          'flight needs a solid block, joined floor ids/heights, and one-block rises along a straight, aligned run',
        ],
      ];
    }
    const issues: SpatialIssue[] = [];
    if ([-1, 0, plan.rise, plan.rise + 1].flatMap(plan.row).some(([x, feet, z]) => !this.terrain(x, feet - 1, z))) {
      issues.push([path, 'flight needs supported landings at both ends']);
    }
    const rows = Array.from({ length: plan.rise + 3 }, (_, i) => i - 1).flatMap(plan.row);
    if (
      rows.some(([x, feet, z]) =>
        Array.from({ length: STAIR_HEADROOM }, (_, dy) => feet + dy).some((y) => this.occupied(x, y, z, false)),
      )
    ) {
      issues.push([path, 'flight needs six clear blocks of headroom along its full length and both landings']);
    }
    return issues;
  }
  canMove(from: Vec3, next: Vec3): boolean {
    if (!this.standing(next)) {
      return false;
    }
    // The physics step-up sweep raises the body one block before moving sideways.
    return next[1] <= from[1] || (this.clear([from[0], next[1], from[2]]) && this.clear(next));
  }
  reached(entrance: Vec3): Set<string> {
    const reached = new Set([key(entrance)]);
    const queue: Vec3[] = [entrance];
    for (const from of queue) {
      const neighbours = [
        [0.5, 0],
        [-0.5, 0],
        [0, 0.5],
        [0, -0.5],
      ].flatMap(([dx, dz]) => [0, 1, -1].map((dy): Vec3 => [from[0] + dx!, from[1] + dy, from[2] + dz!]));
      for (const next of neighbours) {
        if (!reached.has(key(next)) && this.canMove(from, next)) {
          reached.add(key(next));
          queue.push(next);
        }
      }
    }
    return reached;
  }
  floorIssues(reached: Set<string>): SpatialIssue[] {
    const issues: SpatialIssue[] = [];
    const [sx, , sz] = this.template.size;
    for (const floor of this.template.access!.storeys) {
      let cells = 0;
      let disconnected = false;
      for (let z = 0.5; z < sz; z += 0.5) {
        for (let x = 0.5; x < sx; x += 0.5) {
          const pos: Vec3 = [x, floor.floor, z];
          if (this.standing(pos)) {
            cells += 1;
            disconnected ||= !reached.has(key(pos));
          }
        }
      }
      if (cells === 0 || disconnected) {
        issues.push([
          '.access.storeys',
          `storey "${floor.id}" has floor space unreachable from the entrance through openings, openable doors and flights`,
        ]);
      }
    }
    return issues;
  }
}

export const templateSpatialIssues = (registry: Registry, template: CompiledTemplate): SpatialIssue[] => {
  const { access } = template;
  if (!access) {
    return [];
  }
  const floors = new Map(access.storeys.map((floor) => [floor.id, floor.floor]));
  if (
    floors.size !== access.storeys.length ||
    new Set(floors.values()).size !== floors.size ||
    !floors.has(access.ground) ||
    access.storeys.some((floor) => floor.floor < 1 || floor.floor + BODY_HEIGHT > template.size[1])
  ) {
    return [['.access.storeys', 'storeys need unique ids/heights, a ground storey, and room for a standing body']];
  }
  const space = new TemplateSpace(registry, template);
  const issues = access.stairs.flatMap((stair, index) => space.flightIssues(stair, index));
  if (issues.length > 0) {
    return issues;
  }
  if (!space.standing(access.entrance)) {
    return [['.access.entrance', 'entrance needs support and standing headroom']];
  }
  return space.floorIssues(space.reached(access.entrance));
};
