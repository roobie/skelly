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

it('city building alternatives keep cellars and street approaches reachable through owned body space', () => {
  const { registry } = BUNDLED_CONTENT;
  const pool = new Set([...registry.scenarios.values()].flatMap((scenario) => scenario.city.templates));
  const buildings = [...registry.mapAssemblies.values()].filter((assembly) => pool.has(assembly.id) && assembly.access);
  expect(buildings.length).toBeGreaterThan(0);
  let cellar = false;
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
      const compiled = compileAssembly(selected, selected.mapAssemblies.get(building.id)!, {
        seed: 1,
        siteId: 'route_witness',
      });
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
  }
  expect(cellar).toBe(true);
});
