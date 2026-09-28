import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, LOWER_LAYOUTS } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { loadFixture } from './helpers.ts';

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

  it('guards the trigger volume in every generated template and seed', () => {
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
  }, 30_000);

  it('reports a broken assembly without its trigger guard', () => {
    const report = validate(loadFixture('broken-trigger-guard'), gunDomain);
    expect(report.issues.filter(({ rule }) => rule === 'trigger-guard').map(({ message }) => message)).toEqual([
      'lower has a trigger-finger volume but is missing its enclosing trigger guard.',
    ]);
  });
});
