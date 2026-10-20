import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { ParamChoice } from '@skelly/engine/assembly/template.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { worldBox } from '@skelly/engine/shapes/geometry.ts';
import { describe, expect, it } from 'vitest';
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

  it('keeps the five-round box-magazine body shorter than the ten-round and the S band', () => {
    const bodyLength = (length: '5-round' | '10-round' | 'S') => {
      const body = FAMILIES.magazine!.build({ length }).solids[0]!;
      expect(body.kind, length).toBe('box');
      if (body.kind !== 'box') {
        throw new Error('Expected a straight box magazine.');
      }
      return body.box.half[1] * 2;
    };
    expect(bodyLength('5-round')).toBeLessThan(bodyLength('10-round'));
    expect(bodyLength('10-round')).toBeLessThan(bodyLength('S'));
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
      const insertionDepth = magWorld.center[1] + magWorld.half[1] - -2.5;
      return { protrusion, insertionDepth };
    };

    const five = measure('5-round');
    const ten = measure('10-round');
    expect(five.protrusion).toBeCloseTo(0.25);
    expect(five.protrusion).toBeLessThanOrEqual(0.25);
    expect(ten.protrusion).toBeCloseTo(1.25);
    expect(ten.protrusion).toBeLessThanOrEqual(1.5);
    expect(ten.protrusion).toBeGreaterThan(five.protrusion);
    expect(five.insertionDepth).toBeCloseTo(2.75);
    expect(ten.insertionDepth).toBeCloseTo(2.75);
  });
});
