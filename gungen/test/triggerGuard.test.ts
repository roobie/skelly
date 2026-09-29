import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import type { Box } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, LOWER_LAYOUTS } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { loadFixture } from './helpers.ts';
import { sweepGroup } from './sweeps.ts';

const guardIds = ['trigger-guard-top', 'trigger-guard-rear', 'trigger-guard-front', 'trigger-guard-bottom'];

describe('trigger guards', () => {
  it('keeps the pistol frame guard solids bit-identical to the golden', () => {
    const frame = FAMILIES.frame!.build({ bore: 'S', gripLength: 'M', slideLength: 'S' });
    expect(frame.solids.filter(({ id }) => id.startsWith('trigger-guard-'))).toEqual([
      {
        id: 'trigger-guard-top',
        kind: 'box',
        box: { center: [-2, -1.625, 0], half: [2, 0.125, 0.625] },
      },
      {
        id: 'trigger-guard-rear',
        kind: 'box',
        box: { center: [-3.75, -2.75, 0], half: [0.25, 1.25, 0.625] },
      },
      {
        id: 'trigger-guard-front',
        kind: 'box',
        box: { center: [-0.25, -2.75, 0], half: [0.25, 1.25, 0.625] },
      },
      {
        id: 'trigger-guard-bottom',
        kind: 'box',
        box: { center: [-2, -3.875, 0], half: [2, 0.125, 0.625] },
      },
    ]);
  });

  it('keeps lower finger clearances while the rear wall follows the grip mount', () => {
    const bounds = (box: Box) => ({
      min: box.center.map((center, axis) => center - box.half[axis]!),
      max: box.center.map((center, axis) => center + box.half[axis]!),
    });
    for (const layout of Object.keys(LOWER_LAYOUTS)) {
      const def = FAMILIES.lower!.build({ layout });
      const finger = def.keepOuts.find(({ id }) => id === 'trigger-finger')!.box;
      const fingerBounds = bounds(finger);
      const guards = new Map(
        def.solids
          .filter(({ id }) => id.startsWith('trigger-guard-'))
          .map((solid) => {
            expect(solid.kind, `${layout}.${solid.id}`).toBe('box');
            if (solid.kind !== 'box') {
              throw new Error('Expected a box trigger guard.');
            }
            return [solid.id, bounds(solid.box)] as const;
          }),
      );
      const rear = guards.get('trigger-guard-rear')!;
      const front = guards.get('trigger-guard-front')!;
      const top = guards.get('trigger-guard-top')!;
      const bottom = guards.get('trigger-guard-bottom')!;
      expect(fingerBounds.min[0]! - rear.max[0]!, `${layout} rear finger clearance`).toBeCloseTo(0.5, 8);
      expect(front.min[0]! - fingerBounds.max[0]!, `${layout} front finger clearance`).toBeCloseTo(0.5, 8);
      expect(front.max[0]! - front.min[0]!, `${layout} front wall thickness`).toBeCloseTo(0.5, 8);
      expect(fingerBounds.max[1]! - top.min[1]!, `${layout} top contact`).toBeCloseTo(0, 8);
      expect(top.max[1]! - fingerBounds.max[1]!, `${layout} upper wall`).toBeCloseTo(0.25, 8);
      expect(fingerBounds.min[1]! - bottom.max[1]!, `${layout} bottom contact`).toBeCloseTo(0, 8);
      expect(fingerBounds.min[1]! - bottom.min[1]!, `${layout} lower wall`).toBeCloseTo(0.25, 8);
      const keepOutBounds = bounds(finger);
      for (const guard of guards.values()) {
        expect(
          [0, 1, 2].every(
            (axis) => guard.max[axis]! > keepOutBounds.min[axis]! && keepOutBounds.max[axis]! > guard.min[axis]!,
          ),
          layout,
        ).toBe(false);
      }
    }
  });

  it('builds one four-box guard around every lower layout trigger volume', () => {
    for (const layout of Object.keys(LOWER_LAYOUTS)) {
      const lower = FAMILIES.lower!.build({ layout });
      const guards = lower.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
      expect(guards.map(({ id }) => id).sort(), layout).toEqual([...guardIds].sort());
      expect(
        lower.keepOuts.some(({ id }) => id === 'trigger-finger'),
        layout,
      ).toBe(true);
    }
  });

  sweepGroup('guards the trigger volume in every generated template and seed', () => {
    it('passes', () => {
      for (const template of TEMPLATES) {
        for (let seed = 0; seed < 100; seed++) {
          const report = validate(generate(template, gunDomain, seed), gunDomain);
          const triggerOwners = [...report.resolved.defs].filter(([, def]) =>
            def.keepOuts.some(({ id }) => id === 'trigger-finger'),
          );
          expect(triggerOwners.length, `${template.name} seed ${seed}`).toBeGreaterThan(0);
          for (const [part, def] of triggerOwners) {
            const guards = def.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
            expect(guards.map(({ id }) => id).sort(), `${template.name} seed ${seed} ${part}`).toEqual(
              [...guardIds].sort(),
            );
          }
          expect(
            report.issues.filter(({ rule }) => rule === 'trigger-guard'),
            `${template.name} seed ${seed}`,
          ).toEqual([]);
        }
      }
    });
  });

  it('reports a broken assembly without its trigger guard', () => {
    const report = validate(loadFixture('broken-trigger-guard'), gunDomain);
    expect(report.issues.filter(({ rule }) => rule === 'trigger-guard').map(({ message }) => message)).toEqual([
      'lower has a trigger-finger volume but is missing its enclosing trigger guard.',
    ]);
  });
});
