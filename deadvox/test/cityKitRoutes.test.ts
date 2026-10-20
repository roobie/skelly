import { expect, it } from 'vitest';
import { cityGridOf } from '../src/core/cityPlan.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { STAIR_BODY_HALF_WIDTH, STAIR_BODY_HEIGHT } from '../src/core/stairFlight.ts';
import { ownershipCell } from '../src/core/templateOwnership.ts';
import { templateReachableStandingPositions } from '../src/core/templateSpatial.ts';
import { type CompiledTemplate, cellsOf, compileAssembly, kitSlotChoices } from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

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

/**
 * Every compiled alternative of every city-pool building, one per way of choosing each slot.
 * Routes do not depend on the style, so only the style test asks for every style of a building.
 */
const cityAlternatives = function* (everyStyle = false) {
  const { registry } = BUNDLED_CONTENT;
  const rows = new Map(
    [...registry.scenarios.values()]
      .flatMap((scenario) => cityGridOf(registry, scenario.city).templates)
      .map((row) => [everyStyle ? `${row.id}@${row.style ?? ''}` : row.id, row] as const),
  );
  const buildings = [...rows.values()].flatMap(({ id, style }) => {
    const assembly = registry.mapAssemblies.get(id);
    return assembly?.access ? [{ building: assembly, style }] : [];
  });
  if (buildings.length === 0) {
    throw new Error('no city-pool building declares access');
  }
  const alternatives = Math.max(
    ...[...registry.mapAssemblies.values()].flatMap((assembly) =>
      assembly.slots.map((slot) => kitSlotChoices(registry, slot).length),
    ),
  );
  for (const { building, style } of buildings) {
    for (let variant = 0; variant < alternatives; variant++) {
      const selected = {
        ...registry,
        mapAssemblies: new Map(
          [...registry.mapAssemblies.values()].map((assembly) => [
            assembly.id,
            {
              ...assembly,
              slots: assembly.slots.map(({ pool: _pool, ...slot }) => {
                const choices = kitSlotChoices(registry, { ...slot, pool: _pool });
                return { ...slot, choices: [choices[variant % choices.length]!] };
              }),
            },
          ]),
        ),
      };
      yield {
        building,
        style,
        variant,
        compile: () =>
          compileAssembly(selected, selected.mapAssemblies.get(building.id)!, {
            seed: 1,
            siteId: 'route_witness',
            ...(style ? { style } : {}),
          }),
      };
    }
  }
};

const OWNED_AIR = 2;

/** Owned air below grade that no standing anchor reaches through owned air, hatches or ladders, if any. */
const sealedBelowGrade = (compiled: CompiledTemplate): Vec3 | undefined => {
  const { furniture } = BUNDLED_CONTENT.registry;
  const [sx, sy, sz] = compiled.size;
  const [, grade] = compiled.access!.entrance;
  const passages = new Set(
    compiled.pieces
      .filter((piece) => furniture.get(piece.furniture)?.door?.hatch || furniture.get(piece.furniture)?.climbable)
      .flatMap((piece) =>
        [...cellsOf(piece.size)].map((offset) =>
          ownershipCell(compiled.size, offset.map((value, axis) => value + piece.pos[axis]!) as Vec3),
        ),
      ),
  );
  const open = (x: number, y: number, z: number) =>
    x >= 0 &&
    y >= 0 &&
    z >= 0 &&
    x < sx &&
    y < sy &&
    z < sz &&
    (compiled.ownership![ownershipCell(compiled.size, [x, y, z])] === OWNED_AIR ||
      passages.has(ownershipCell(compiled.size, [x, y, z])));
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

it('a pool row styles every facade piece of its building, whichever way each slot is chosen', () => {
  const { registry } = BUNDLED_CONTENT;
  const literal = new Set(
    [...registry.mapPieces.values()].flatMap((piece) =>
      Object.values(piece.palette).flatMap((entry) =>
        typeof entry === 'string' ? [registry.blockIds.get(entry)!] : [],
      ),
    ),
  );
  const bound = (style: string) =>
    new Set(Object.values(registry.mapStyles.get(style)!.bindings).map(({ block }) => registry.blockIds.get(block)!));
  const styles = new Set<string>();
  let checkedForeign = 0;
  for (const { building, style, compile } of cityAlternatives(true)) {
    if (!style) {
      continue;
    }
    styles.add(style);
    const own = bound(style);
    const foreign = new Set(
      [...registry.mapStyles.keys()]
        .filter((other) => other !== style)
        .flatMap((other) => [...bound(other)])
        .filter((block) => !(own.has(block) || literal.has(block))),
    );
    checkedForeign += foreign.size;
    const used = new Set(compile().blocks);
    expect(
      [...foreign].filter((block) => used.has(block)),
      `${building.id}@${style}: blocks bound only by another style`,
    ).toEqual([]);
    expect(
      [...own].filter((block) => used.has(block)).length,
      `${building.id}@${style}: uses its own palette`,
    ).toBeGreaterThan(0);
  }
  expect(styles.size).toBeGreaterThan(1);
  expect(checkedForeign, 'some style must have a foreign block to catch').toBeGreaterThan(0);
});

it('city buildings leave no sealed owned air below grade that nothing can stand in or reach', () => {
  let cellar = false;
  for (const { building, compile } of cityAlternatives()) {
    const compiled = compile();
    cellar ||= Object.values(compiled.anchors!).some(
      (anchor) => anchor.kind === 'standing' && anchor.at[1] < compiled.access!.entrance[1],
    );
    expect(sealedBelowGrade(compiled), `${building.id}: sealed owned air`).toBeUndefined();
  }
  expect(cellar, 'city pool exercises below-grade standing space').toBe(true);
});

// Separate cases keep added buildings and slot alternatives from sharing one deadline.
for (const { building, variant, compile } of cityAlternatives()) {
  it(`${building.id} alternative ${variant} keeps cellars and street approaches reachable through owned body space`, () => {
    const { registry } = BUNDLED_CONTENT;
    const compiled = compile();
    const targets = Object.values(compiled.anchors!).filter((anchor) => anchor.kind === 'standing');
    expect(targets.length, 'standing route witnesses').toBeGreaterThan(0);
    const entry = compiled.access!.entrance;
    const doorSlot = building.slots.find((slot) => slot.id === 'door');
    const cellsAt = (size: Vec3, at: Vec3) =>
      [...cellsOf(size)].map((offset) =>
        ownershipCell(compiled.size, offset.map((value, axis) => value + at[axis]!) as Vec3),
      );
    const doorPieces = compiled.pieces.filter((piece) => registry.furniture.get(piece.furniture)!.door);
    const locked = new Set(
      doorPieces.filter((piece) => piece.lock?.locked).flatMap((piece) => cellsAt(piece.size, piece.pos)),
    );
    const doors = new Set(
      [
        ...doorPieces.filter((piece) => !piece.lock?.locked).flatMap((piece) => cellsAt(piece.size, piece.pos)),
        ...(doorSlot ? cellsAt(doorSlot.size, doorSlot.at) : []),
      ].filter((cell) => !locked.has(cell)),
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
      expect(outward.has(target.at.join(',')), `${building.id}: entry`).toBe(true);
      expect(reachable(target.at).has(entry.join(',')), `${building.id}: return`).toBe(true);
    }
  });
}
