import { describe, expect, it } from 'vitest';
import { worldBox } from '../src/core/geometry.ts';
import { resolve } from '../src/core/resolve.ts';
import type { ParamChoice } from '../src/core/template.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { variant } from './helpers.ts';

const parameterChoices = (value: ParamChoice | undefined): readonly string[] => {
  if (value === undefined || (typeof value === 'object' && !Array.isArray(value))) {
    return [];
  }
  return typeof value === 'string' ? [value] : value;
};

const isBoxFedBoltRifle = (template: (typeof TEMPLATES)[number]): boolean => {
  const receiver = template.slots.find(({ family }) => family === 'receiver');
  return receiver?.params?.action === 'bolt' && receiver.params.feed === 'box';
};

describe('magazine length bands', () => {
  it('limits the short bolt-magazine band to the detachable-box bolt rifle', () => {
    const boxFedBoltRifles = TEMPLATES.filter(isBoxFedBoltRifle).map(({ name }) => name);
    expect(boxFedBoltRifles).toEqual(['bolt-rifle-box', 'bolt-rifle-thumbhole']);

    for (const template of TEMPLATES) {
      const magazine = template.slots.find(({ family }) => family === 'magazine');
      if (!magazine) {
        continue;
      }
      const choices = parameterChoices(magazine.params?.length);
      if (isBoxFedBoltRifle(template)) {
        expect(choices).toEqual(['5-round', '10-round']);
      } else {
        expect(choices).not.toContain('5-round');
        expect(choices).not.toContain('10-round');
      }
    }
  });

  it('builds the S/M/L magazine bands for each straight and curved profile', () => {
    const straightBands = {
      standard: { S: 6, M: 10, L: 16 },
      smg: { S: 6, M: 10, L: 16 },
      pistol: { S: 6, M: 10, L: 16 },
    } as const;
    for (const [profile, bands] of Object.entries(straightBands)) {
      for (const size of ['S', 'M', 'L'] as const) {
        const body = FAMILIES.magazine!.build({ profile, length: size }).solids[0]!;
        expect(body.kind, `${profile} ${size}`).toBe('box');
        if (body.kind === 'box') {
          expect(body.box.half[1] * 2, `${profile} ${size} body length`).toBe(bands[size]);
        }
      }
    }
    // Curved bodies follow their band: the vertical envelope grows from S to M to L for every curved profile and
    // AK variant. g41-4 dropped the pinned envelopes, which drift whenever a curve is refitted to a reference.
    const curved = [
      ...FAMILIES.magazine!.params.variant!.values.map((akVariant) => ({ profile: 'ak-curved', variant: akVariant })),
      { profile: 'stanag-curved' },
    ];
    for (const params of curved) {
      const [small, medium, large] = (['S', 'M', 'L'] as const).map((length) => {
        const yValues = FAMILIES.magazine!.build({ ...params, length }).solids.flatMap((solid) =>
          solid.kind === 'box' ? [] : solid.profile.map(([, yCoordinate]) => yCoordinate),
        );
        return Math.max(...yValues) - Math.min(...yValues);
      });
      const label = JSON.stringify(params);
      expect(small, label).toBeLessThan(medium!);
      expect(medium, label).toBeLessThan(large!);
    }
  });

  it('keeps the short box-magazine body shorter than the longer variant', () => {
    const short = FAMILIES.magazine!.build({ length: '5-round' }).solids[0]!;
    const long = FAMILIES.magazine!.build({ length: '10-round' }).solids[0]!;
    expect(short.kind).toBe('box');
    expect(long.kind).toBe('box');
    if (short.kind !== 'box' || long.kind !== 'box') {
      throw new Error('Expected straight box magazines.');
    }
    expect(short.box.half[1]).toBeLessThan(long.box.half[1]);
  });

  it('seats both bolt magazines deep and limits protrusion below the well line', () => {
    const measure = (length: '5-round' | '10-round') => {
      const assembly = variant('archetype-bolt-rifle-box', (draft) => {
        draft.parts.magazine!.params!.length = length;
      });
      const report = validate(assembly, gunDomain);
      expect(report.ok, `${length} bolt-rifle assembly`).toBe(true);
      const resolved = resolve(assembly, gunDomain);
      const magazineTransform = resolved.placed.get('magazine')!;
      const magazineBody = resolved.defs.get('magazine')!.solids[0]!;
      const lowerTransform = resolved.placed.get('lower')!;
      const lower = resolved.defs.get('lower')!;
      if (magazineBody.kind !== 'box') {
        throw new Error('Expected a box magazine body.');
      }
      const magWorld = worldBox(magazineTransform, magazineBody.box);
      const lowerBottom = Math.min(
        ...lower.solids
          .filter((solid) => !solid.id.startsWith('trigger-guard-'))
          .map((solid) => {
            if (solid.kind !== 'box') {
              throw new Error('Expected lower frame boxes.');
            }
            const world = worldBox(lowerTransform, solid.box);
            return world.center[1] - world.half[1];
          }),
      );
      const protrusion = lowerBottom - (magWorld.center[1] - magWorld.half[1]);
      const insertionDepth = magWorld.center[1] + magWorld.half[1] - lowerBottom;
      return { protrusion, insertionDepth, bodyLength: magWorld.half[1] * 2 };
    };

    const five = measure('5-round');
    const ten = measure('10-round');
    expect(ten.protrusion).toBeGreaterThan(five.protrusion);
    expect(five.insertionDepth).toBeCloseTo(ten.insertionDepth);
    expect(ten.bodyLength).toBeGreaterThan(five.bodyLength);
  });
});
