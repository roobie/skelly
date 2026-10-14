import { expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from '../src/core/stairFlight.ts';
import { ownershipCell } from '../src/core/templateOwnership.ts';
import { templateReachableStandingPositions } from '../src/core/templateSpatial.ts';
import { type CompiledTemplate, cellsOf, compileAssembly } from '../src/core/templates.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';

const knownBody = (template: CompiledTemplate, [x, feet, z]: Vec3, doors: Set<number>): boolean => {
  for (let y = Math.floor(feet); y < Math.ceil(feet + STAIR_BODY_HEIGHT); y++) {
    for (let bz = Math.floor(z - STAIR_BODY_HALF_WIDTH); bz < Math.ceil(z + STAIR_BODY_HALF_WIDTH); bz++) {
      for (let bx = Math.floor(x - STAIR_BODY_HALF_WIDTH); bx < Math.ceil(x + STAIR_BODY_HALF_WIDTH); bx++) {
        if (
          bx < 0 ||
          y < 0 ||
          bz < 0 ||
          bx >= template.size[0] ||
          y >= template.size[1] ||
          bz >= template.size[2] ||
          (template.reserved![ownershipCell(template.size, [bx, y, bz])] !== 1 &&
            !doors.has(ownershipCell(template.size, [bx, y, bz])))
        ) {
          return false;
        }
      }
    }
  }
  return true;
};

/** Every compiled alternative of every city-pool building, one per way of choosing each slot. */
const cityAlternatives = function* () {
  const { registry } = BUNDLED_CONTENT;
  const pool = new Set([...registry.scenarios.values()].flatMap((scenario) => scenario.city.templates));
  const buildings = [...registry.mapAssemblies.values()].filter((assembly) => pool.has(assembly.id) && assembly.access);
  if (buildings.length === 0) {
    throw new Error('no city-pool building declares access');
  }
  const alternatives = Math.max(
    ...[...registry.mapAssemblies.values()].flatMap((assembly) => assembly.slots.map((slot) => slot.choices.length)),
  );
  for (const building of buildings) {
    for (let variant = 0; variant < alternatives; variant++) {
      const selected = {
        ...registry,
        mapAssemblies: new Map(
          [...registry.mapAssemblies.values()].map((assembly) => [
            assembly.id,
            {
              ...assembly,
              slots: assembly.slots.map((slot) => ({
                ...slot,
                choices: [slot.choices[variant % slot.choices.length]!],
              })),
            },
          ]),
        ),
      };
      yield {
        building,
        compiled: compileAssembly(selected, selected.mapAssemblies.get(building.id)!, {
          seed: 1,
          siteId: 'route_witness',
        }),
      };
    }
  }
};

const OWNED_AIR = 2;

/** Owned air below grade that no standing anchor reaches through owned air, if any. */
const sealedBelowGrade = (compiled: CompiledTemplate): Vec3 | undefined => {
  const [sx, sy, sz] = compiled.size;
  const [, grade] = compiled.access!.entrance;
  const open = (x: number, y: number, z: number) =>
    x >= 0 &&
    y >= 0 &&
    z >= 0 &&
    x < sx &&
    y < sy &&
    z < sz &&
    compiled.ownership![ownershipCell(compiled.size, [x, y, z])] === OWNED_AIR;
  const seen = new Set<number>();
  const queue: Vec3[] = Object.values(compiled.anchors!)
    .filter((anchor) => anchor.kind === 'standing')
    .map((anchor) => anchor.at.map(Math.floor) as Vec3);
  for (const [x, y, z] of queue) {
    if (open(x, y, z) && !seen.has(ownershipCell(compiled.size, [x, y, z]))) {
      seen.add(ownershipCell(compiled.size, [x, y, z]));
      queue.push([x + 1, y, z], [x - 1, y, z], [x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]);
    }
  }
  for (let y = 0; y < grade; y++) {
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        if (open(x, y, z) && !seen.has(ownershipCell(compiled.size, [x, y, z]))) {
          return [x, y, z];
        }
      }
    }
  }
  return undefined;
};

it('city buildings leave no sealed owned air below grade that nothing can stand in or reach', () => {
  for (const { building, compiled } of cityAlternatives()) {
    expect(sealedBelowGrade(compiled), `${building.id}: sealed owned air`).toBeUndefined();
  }
});

it('city building alternatives keep cellars and street approaches reachable through owned body space', () => {
  const { registry } = BUNDLED_CONTENT;
  let cellar = false;
  for (const { building, compiled } of cityAlternatives()) {
    const targets = Object.values(compiled.anchors!).filter((anchor) => anchor.kind === 'standing');
    const entry = compiled.access!.entrance;
    const doors = new Set(
      compiled.pieces
        .filter((piece) => registry.furniture.get(piece.furniture)!.door && !piece.lock?.locked)
        .flatMap((piece) =>
          [...cellsOf(piece.size)].map((offset) =>
            ownershipCell(compiled.size, offset.map((value, axis) => value + piece.pos[axis]!) as Vec3),
          ),
        ),
    );
    const reachable = (entrance: Vec3) =>
      new Set(
        templateReachableStandingPositions(registry, compiled, {
          entrance,
          within: (position) => knownBody(compiled, position, doors),
        }).map((position) => position.join(',')),
      );
    const outward = reachable(entry);
    for (const target of targets) {
      cellar ||= target.at[1] < entry[1];
      expect(outward.has(target.at.join(',')), `${building.id}: entry`).toBe(true);
      expect(reachable(target.at).has(entry.join(',')), `${building.id}: return`).toBe(true);
    }
  }
  expect(cellar).toBe(true);
});
