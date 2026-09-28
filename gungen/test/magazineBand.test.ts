import { describe, expect, it } from 'vitest';
import { worldBox } from '../src/core/geometry.ts';
import { resolve } from '../src/core/resolve.ts';
import type { ParamReference } from '../src/core/template.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { variant } from './helpers.ts';

const parameterChoices = (value: string | readonly string[] | ParamReference | undefined): readonly string[] => {
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
    expect(boxFedBoltRifles).toEqual(['bolt-rifle-box']);

    for (const template of TEMPLATES) {
      const magazine = template.slots.find(({ family }) => family === 'magazine');
      if (!magazine) {
        continue;
      }
      const choices = parameterChoices(magazine.params?.length);
      if (template.name === 'bolt-rifle-box') {
        expect(choices).toEqual(['5-round', '10-round']);
      } else {
        expect(choices).not.toContain('5-round');
        expect(choices).not.toContain('10-round');
      }
    }
  });

  it('keeps the five-round box-magazine body at 4.5u (about 52mm)', () => {
    const magazine = FAMILIES.magazine!.build({ length: '5-round' });
    const body = magazine.solids[0]!;
    expect(body.kind).toBe('box');
    if (body.kind !== 'box') {
      throw new Error('Expected a straight box magazine.');
    }
    expect(body.box.center[1] + body.box.half[1] - (body.box.center[1] - body.box.half[1])).toBeCloseTo(4.5);
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
        ...lower.solids.map((solid) => {
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
