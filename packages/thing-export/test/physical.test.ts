import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import { applyPoint, scale } from '@skelly/engine/foundation/math.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import type { MaterialDef } from '@skelly/thing-core/materials';
import { describe, expect, it } from 'vitest';
import { modelParts, partProperties } from '../src/physical.ts';

const material = (densityKgPerM3: number): MaterialDef => ({
  colour: [0, 0, 0],
  finish: { metallic: 0, roughness: 1 },
  densityKgPerM3,
  source: 'fixture',
});
const definition = (solids: readonly Solid[]): PartDef => ({
  family: 'shape',
  solids,
  ports: [],
  keepOuts: [],
  axes: [],
});
const box: Solid = { id: 'body', kind: 'box', box: { center: [2, 3, 4], half: [1, 1, 1] } };

const shapes: readonly { name: string; solid: Solid; volume: number; centre: readonly number[] }[] = [
  { name: 'box', solid: box, volume: 8, centre: [2, 3, 4] },
  {
    name: 'clipped extrusion',
    solid: {
      id: 'body',
      kind: 'extruded-polygon',
      profile: [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
      ],
      z: [0, 2],
      clip: [{ normal: [1, 0, 0], offset: 1 }],
    },
    volume: 4,
    centre: [0.5, 1, 1],
  },
  {
    name: 'hollow revolution',
    solid: {
      id: 'body',
      kind: 'revolved',
      axis: 'x',
      origin: [3, 5, 7],
      profile: [
        [0, 2],
        [4, 2],
        [4, 1],
        [0, 1],
      ],
    },
    volume: 12 * Math.PI,
    centre: [5, 5, 7],
  },
  {
    name: 'tapered revolution',
    solid: {
      id: 'body',
      kind: 'revolved',
      axis: 'y',
      origin: [3, 5, 7],
      profile: [
        [0, 0],
        [4, 2],
        [4, 0],
      ],
    },
    volume: (16 * Math.PI) / 3,
    centre: [3, 8, 7],
  },
];

describe('physical export', () => {
  it.each(shapes)('integrates $name volume and centre before converting units', ({ solid, volume, centre }) => {
    const unit = 0.1;
    const density = 2;
    const fill = 0.5;
    const result = partProperties(unit, {
      part: definition([solid]),
      fillFraction: fill,
      materialFor: () => material(density),
    });
    expect(result.massKg).toBeCloseTo(volume * unit ** 3 * density * fill, 10);
    for (const [axis, value] of result.centreOfMass.entries()) {
      expect(value).toBeCloseTo(centre[axis]! * unit, 10);
    }
  });

  it('uses material density as a mass relation for identical geometry', () => {
    const mass = (density: number) =>
      partProperties(1, {
        part: definition([box]),
        fillFraction: 1,
        materialFor: () => material(density),
      }).massKg;
    expect(mass(2)).toBe(mass(1) * 2);
  });

  it('weights a compound centre by solid mass rather than averaging centres', () => {
    const part = definition([
      { id: 'light', kind: 'box', box: { center: [0, 0, 0], half: [0.5, 0.5, 0.5] } },
      { id: 'heavy', kind: 'box', box: { center: [6, 0, 0], half: [0.5, 0.5, 0.5] } },
    ]);
    const result = partProperties(1, {
      part,
      fillFraction: 1,
      materialFor: (solid) => material(solid.id === 'light' ? 1 : 3),
    });
    expect(result.centreOfMass).toEqual([4.5, 0, 0]);
  });

  it('places physical centres in file metres and identifies nodes by instance family', () => {
    const part = {
      ...definition([box]),
      ports: [
        {
          id: 'base',
          mount: 'fixture',
          gender: 'male' as const,
          pos: [0, 0, 0] as const,
          normal: [0, 0, -1] as const,
          up: [0, 1, 0] as const,
        },
      ],
    };
    const base = {
      ...definition([]),
      ports: [
        {
          id: 'child',
          mount: 'fixture',
          gender: 'female' as const,
          pos: [10, 20, 30] as const,
          normal: [0, 0, 1] as const,
          up: [0, 1, 0] as const,
        },
      ],
    };
    const domain: Domain = {
      name: 'fixture',
      units: { metresPerUnit: 0.1, grid: 1, bevel: 0 },
      axisRules: [],
      families: {
        base: { name: 'base', params: {}, build: () => base },
        instance: { name: 'instance', params: {}, build: () => part },
      },
    };
    const resolved = resolve(
      {
        name: 'fixture',
        root: 'base',
        parts: { base: { family: 'base' }, child: { family: 'instance' } },
        connections: [{ from: 'base.child', to: 'child.base', roll: 90 }],
      },
      domain,
    );
    expect(resolved.issues).toEqual([]);
    const parts = modelParts(resolved, (_id, shape) => ({
      part: shape,
      fillFraction: 1,
      materialFor: () => material(1),
    }));
    const expected = scale(applyPoint(resolved.placed.get('child')!, box.box.center), domain.units.metresPerUnit);
    for (const [axis, value] of parts.child!.centreOfMass.entries()) {
      expect(value).toBeCloseTo(expected[axis]!, 10);
    }
    expect(parts.child!.node).toBe('child:instance');
  });
});
