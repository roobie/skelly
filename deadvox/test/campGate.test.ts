import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { type CompiledTemplate, compileTemplate } from '../src/core/templates.ts';

const sources = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json') && !file.startsWith('layouts'))
  .sort()
  .map((source) => ({ source, data: JSON.parse(readFileSync(join('src/content/base', source), 'utf8')) as unknown }));
const { registry } = buildRegistry(sources);

const template = (id: string): CompiledTemplate => compileTemplate(registry, registry.templates.get(id)!);

const doorPieces = (compiled: CompiledTemplate) =>
  compiled.pieces.filter((piece) => registry.furniture.get(piece.furniture)?.door);

const doorFootprintAtStandingHeight = (compiled: CompiledTemplate): Set<string> =>
  new Set(
    doorPieces(compiled).flatMap((piece) => {
      const y = 1;
      if (y < piece.pos[1] || y >= piece.pos[1] + piece.size[1]) {
        return [];
      }
      return Array.from({ length: piece.size[2] }, (_depthIndex, depthOffset) =>
        Array.from(
          { length: piece.size[0] },
          (_widthIndex, widthOffset) => `${piece.pos[0] + widthOffset},${piece.pos[2] + depthOffset}`,
        ),
      ).flat();
    }),
  );

interface Placement {
  compiled: CompiledTemplate;
  x: number;
  z: number;
}

const blocksAt = (compiled: CompiledTemplate, x: number, y: number, z: number): boolean => {
  const [width, , depth] = compiled.size;
  const block = compiled.blocks[x + width * (z + depth * y)]!;
  if (registry.blocks[block]?.solid) {
    return true;
  }
  return compiled.pieces.some((piece) => {
    if (
      x < piece.pos[0] ||
      x >= piece.pos[0] + piece.size[0] ||
      y < piece.pos[1] ||
      y >= piece.pos[1] + piece.size[1] ||
      z < piece.pos[2] ||
      z >= piece.pos[2] + piece.size[2]
    ) {
      return false;
    }
    const furniture = registry.furniture.get(piece.furniture)!;
    return furniture.door !== undefined || furniture.solid !== false;
  });
};

interface PathOptions {
  placements: readonly Placement[];
  gateX: number;
  outerDepth: number;
  innerZ: number;
  gateWidth: number;
  returnWidth: number;
  innerDoorBlocked?: ReadonlySet<string>;
}

const findPath = ({
  placements,
  gateX,
  outerDepth,
  innerZ,
  gateWidth,
  returnWidth,
  innerDoorBlocked = new Set(),
}: PathOptions): [number, number][] | undefined => {
  const gridWidth = gateWidth + returnWidth * 2;
  const gridDepth = innerZ + outerDepth * 2 + 2;
  const start: [number, number] = [gateX + Math.floor(gateWidth / 2), outerDepth + 1];
  const target: [number, number] = [gateX + Math.floor(gateWidth / 2), innerZ + outerDepth + 1];
  const key = (x: number, z: number) => `${x},${z}`;
  const previous = new Map<string, string | null>([[key(...start), null]]);
  const queue: [number, number][] = [start];
  const outerGateEnd = gateX + gateWidth;

  const blocked = (x: number, z: number): boolean => {
    if (x <= 0 || x >= gridWidth - 1 || z < 0 || z >= gridDepth) {
      return true;
    }
    if (z < outerDepth && (x < gateX || x >= outerGateEnd)) {
      return true;
    }
    if (innerDoorBlocked.has(key(x - gateX, z - innerZ))) {
      return true;
    }
    return placements.some(({ compiled, x: originX, z: originZ }) => {
      const localX = x - originX;
      const localZ = z - originZ;
      return (
        localX >= 0 &&
        localX < compiled.size[0] &&
        localZ >= 0 &&
        localZ < compiled.size[2] &&
        blocksAt(compiled, localX, 1, localZ)
      );
    });
  };

  for (const [x, z] of queue) {
    if (x === target[0] && z === target[1]) {
      const path: [number, number][] = [];
      let current: string | null = key(x, z);
      while (current !== null) {
        const [pathX, pathZ] = current.split(',').map(Number) as [number, number];
        path.push([pathX, pathZ]);
        current = previous.get(current) ?? null;
      }
      return path.reverse();
    }
    for (const [nextX, nextZ] of [
      [x - 1, z],
      [x + 1, z],
      [x, z - 1],
      [x, z + 1],
    ]) {
      const nextKey = key(nextX!, nextZ!);
      if (!(previous.has(nextKey) || blocked(nextX!, nextZ!))) {
        previous.set(nextKey, key(x, z));
        queue.push([nextX!, nextZ!]);
      }
    }
  }
  return undefined;
};

describe('camp gate templates', () => {
  it('uses two operable gate leaves wider than a person door and removes one leaf for gate 2', () => {
    const gate = template('camp_gate');
    const damaged = template('camp_gate_damaged');
    const leaves = doorPieces(gate);
    const remaining = doorPieces(damaged);
    const personDoor = registry.furniture.get('wood_door')!;
    const rollerDoor = registry.furniture.get('workshop_roller_door')!;

    expect(leaves.length).toBeGreaterThan(1);
    expect(leaves.every((leaf) => registry.furniture.get(leaf.furniture)?.door)).toBe(true);
    expect(leaves.every((leaf) => leaf.size[0] > personDoor.size[0])).toBe(true);
    expect(leaves.every((leaf) => leaf.size[1] >= rollerDoor.size[1])).toBe(true);
    expect(remaining.length).toBeLessThan(leaves.length);
    expect(remaining.length).toBeGreaterThan(0);
  });

  it('routes through gate 2’s missing leaf and prevents a route around the closed gate', () => {
    const outer = template('camp_gate');
    const inner = template('camp_gate_damaged');
    const returnWall = template('camp_gate_return');
    const [returnWidth, , innerZ] = returnWall.size;
    const [gateWidth, , outerDepth] = outer.size;
    const gateX = returnWidth;
    const innerDoorOpening = new Set(
      [...doorFootprintAtStandingHeight(outer)].filter((cell) => !doorFootprintAtStandingHeight(inner).has(cell)),
    );
    const placements: Placement[] = [
      { compiled: outer, x: gateX, z: 0 },
      { compiled: inner, x: gateX, z: innerZ },
      { compiled: returnWall, x: gateX, z: 0 },
      { compiled: returnWall, x: gateX + gateWidth - returnWidth, z: 0 },
    ];

    const path = findPath({ placements, gateX, outerDepth, innerZ, gateWidth, returnWidth });
    expect(path).toBeDefined();
    expect(path!.some(([x, z]) => innerDoorOpening.has(`${x - gateX},${z - innerZ}`))).toBe(true);
    expect(
      findPath({
        placements,
        gateX,
        outerDepth,
        innerZ,
        gateWidth,
        returnWidth,
        innerDoorBlocked: doorFootprintAtStandingHeight(outer),
      }),
    ).toBe(undefined);
  });
});
