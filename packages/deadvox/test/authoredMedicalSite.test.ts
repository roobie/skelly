import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SiteLayoutDef } from '../../engine/src/core/schema.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from '../../engine/src/core/stairFlight.ts';
import { templateReachableStandingPositions, templateSpatialIssues } from '../../engine/src/core/templateSpatial.ts';
import { type CompiledTemplate, compileTemplate } from '../../engine/src/core/templates.ts';
import { buildRegistry } from '../../engine/src/content.ts';
import { reachTuning } from '../../engine/src/sim.ts';
import { BLOCK_SIZE, type Facing } from '../../engine/src/world.ts';
import { baseContentSources } from './baseContentFiles.ts';
import { PLAYER } from './playerFixture.ts';

const sources = baseContentSources().filter(({ source }) => !source.startsWith('layouts'));
const layout = (
  JSON.parse(readFileSync('mods/skelly.deadvox.scenario.playtest/layouts-playtest.json', 'utf8')) as {
    layouts: SiteLayoutDef[];
  }
).layouts[0]!;
const result = buildRegistry([...sources, { source: 'medical-layout-test.json', data: { layouts: [layout] } }]);
// Every distinct building the layout places that a player can walk into.
const accessibleTemplates = [...new Set(layout.buildings.map(({ template }) => template))]
  .map((id) => compileTemplate(result.registry, result.registry.templates.get(id)!))
  .filter((template) => template.access !== undefined);

type Piece = CompiledTemplate['pieces'][number];
type Position = readonly [number, number, number];

const nearPiece = (reachable: readonly Position[], piece: Pick<Piece, 'pos' | 'size'>): boolean => {
  const [x, feet, z] = piece.pos;
  const [width, , depth] = piece.size;
  return reachable.some(([px, py, pz]) => {
    if (py !== feet) {
      return false;
    }
    const dx = Math.max(x - px, 0, px - (x + width));
    const dz = Math.max(z - pz, 0, pz - (z + depth));
    return Math.hypot(dx, dz) <= STAIR_BODY_HALF_WIDTH + 0.5;
  });
};

const wallOffDoor = (template: CompiledTemplate, door: Piece): CompiledTemplate => {
  const blocks = new Uint16Array(template.blocks);
  const wall = [...result.registry.blockIds.values()].find((id) => result.registry.blocks[id]?.solid)!;
  const [width, , depth] = template.size;
  const [doorX, doorY, doorZ] = door.pos;
  const [doorWidth, doorHeight, doorDepth] = door.size;
  for (let y = doorY; y < doorY + doorHeight; y++) {
    for (let z = doorZ; z < doorZ + doorDepth; z++) {
      for (let x = doorX; x < doorX + doorWidth; x++) {
        blocks[x + width * (z + depth * y)] = wall;
      }
    }
  }
  return { ...template, blocks, pieces: template.pieces.filter((piece) => piece !== door) };
};

const FACING_VECTOR: Record<Facing, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

const blockIndex = ({ size: [width, , depth] }: CompiledTemplate, x: number, y: number, z: number): number =>
  x + width * (z + depth * y);

/** The cells one past the piece on the side opposite its facing, where its wall stands. */
const cellsBehind = ({ pos: [x, y, z], size: [width, height, depth], facing }: Piece): Position[] => {
  const [frontX, frontZ] = FACING_VECTOR[facing];
  const xs = frontX === 0 ? Array.from({ length: width }, (_, dx) => x + dx) : [frontX > 0 ? x - 1 : x + width];
  const zs = frontZ === 0 ? Array.from({ length: depth }, (_, dz) => z + dz) : [frontZ > 0 ? z - 1 : z + depth];
  return Array.from({ length: height }, (_, dy) => y + dy).flatMap((wy) =>
    xs.flatMap((wx) => zs.map((wz): Position => [wx, wy, wz])),
  );
};

const bodyOverlaps =
  ({ pos: [x, y, z], size: [width, height, depth] }: Piece) =>
  ([px, feet, pz]: Position): boolean =>
    px + STAIR_BODY_HALF_WIDTH > x &&
    px - STAIR_BODY_HALF_WIDTH < x + width &&
    pz + STAIR_BODY_HALF_WIDTH > z &&
    pz - STAIR_BODY_HALF_WIDTH < z + depth &&
    feet < y + height &&
    feet + STAIR_BODY_HEIGHT > y;

const inFrontOf =
  ({ pos: [x, , z], size: [width, , depth], facing }: Piece) =>
  ([px, , pz]: Position): boolean => {
    const [frontX, frontZ] = FACING_VECTOR[facing];
    return (
      (frontX > 0 && px > x + width) ||
      (frontX < 0 && px < x) ||
      (frontZ > 0 && pz > z + depth) ||
      (frontZ < 0 && pz < z)
    );
  };

const horizontalGap = ({ pos: [x, , z], size: [width, , depth] }: Piece, [px, , pz]: Position): number =>
  Math.hypot(Math.max(x - px, 0, px - (x + width)), Math.max(z - pz, 0, pz - (z + depth)));

describe('authored site buildings', () => {
  it('makes every accessible placed building enterable with reachable standing room inside its walls', () => {
    expect(accessibleTemplates.length).toBeGreaterThan(0);
    for (const template of accessibleTemplates) {
      expect(templateSpatialIssues(result.registry, template), template.id).toEqual([]);
      const reachable = templateReachableStandingPositions(result.registry, template);
      const [width, , depth] = template.size;
      expect(
        reachable.some(
          ([x, feet, z]) =>
            feet === template.access?.storeys[0]?.floor && x > 1 && x < width - 1 && z > 1 && z < depth - 1,
        ),
        template.id,
      ).toBe(true);
    }
  });

  it('hangs wall mounts across the standing eye line', () => {
    const wallMounts = [...result.registry.templates.values()].flatMap((templateDefinition) => {
      const template = compileTemplate(result.registry, templateDefinition);
      return template.pieces.flatMap((piece) => {
        const definition = result.registry.furniture.get(piece.furniture)!;
        return definition.mount === 'wall' ? [{ template, piece, definition }] : [];
      });
    });
    expect(wallMounts.length).toBeGreaterThan(0);
    for (const { template, piece, definition } of wallMounts) {
      const [x, y, z] = piece.pos;
      const [width, , depth] = template.size;
      let floor = y - 1;
      while (floor >= 0 && !result.registry.blocks[template.blocks[x + width * (z + depth * floor)]!]?.solid) {
        floor -= 1;
      }
      expect(floor, `${piece.furniture} standing support`).toBeGreaterThanOrEqual(0);
      const shape = definition.shape![0]!;
      const eyeLine = (floor + 1) * BLOCK_SIZE + PLAYER.eye;
      const faceCentre = (y + shape.position[1] + shape.size[1] / 2) * BLOCK_SIZE;
      expect(Math.abs(faceCentre - eyeLine), `${piece.furniture} standing eye line`).toBeLessThanOrEqual(
        (shape.size[1] * BLOCK_SIZE) / 2,
      );
    }
  });

  it('backs every non-solid wall mount in an accessible building with wall and leaves it usable from its front', () => {
    const air = result.registry.blockIds.get('air');
    const { useReachMetres } = reachTuning(result.registry);
    let checked = 0;
    for (const template of accessibleTemplates) {
      const reachable = templateReachableStandingPositions(result.registry, template);
      const mounts = template.pieces.filter((piece) => {
        const definition = result.registry.furniture.get(piece.furniture)!;
        return definition.mount === 'wall' && definition.solid === false;
      });
      for (const mount of mounts) {
        checked += 1;
        const label = `${template.id} ${mount.furniture} at ${mount.pos.join(',')}`;
        expect(
          cellsBehind(mount).every(([wx, wy, wz]) => template.blocks[blockIndex(template, wx, wy, wz)] !== air),
          `${label} wall behind`,
        ).toBe(true);
        expect(reachable.some(bodyOverlaps(mount)), `${label} reachable`).toBe(true);
        expect(
          reachable
            .filter(inFrontOf(mount))
            .some((position) => horizontalGap(mount, position) * BLOCK_SIZE <= useReachMetres),
          `${label} usable from its front`,
        ).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('makes every locked door in an accessible building openable by key or pry, and the only way to the room it closes', () => {
    let checked = 0;
    for (const template of accessibleTemplates) {
      const reachable = templateReachableStandingPositions(result.registry, template);
      const containers = template.pieces.filter((piece) => result.registry.furniture.get(piece.furniture)?.container);
      // A locked container (a safe) closes only itself; a locked door to a room is the one under test.
      const roomDoors = template.pieces.filter(
        (piece) => piece.lock?.locked && !result.registry.furniture.get(piece.furniture)?.container,
      );
      for (const door of roomDoors) {
        checked += 1;
        const label = `${template.id} door at ${door.pos.join(',')}`;
        const pryable = result.registry.furniture.get(door.furniture)?.door?.methods.pry !== undefined;
        const keyable = [...result.registry.items.values()].some(({ key }) => key?.lock === door.lock!.id);
        expect(pryable || keyable, `${label} opens by key or pry`).toBe(true);
        const closed = templateReachableStandingPositions(result.registry, wallOffDoor(template, door));
        expect(
          containers.some((piece) => nearPiece(reachable, piece) && !nearPiece(closed, piece)),
          `${label} closes off a container`,
        ).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
