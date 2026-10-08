import { describe, expect, it } from 'vitest';
import { localSolidBounds } from '../src/core/geometry.ts';
import type { Box } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, LOWER_LAYOUTS } from '../src/gun/parts.ts';
import { loadCorpus, loadFixture } from './helpers.ts';

describe('trigger guards', () => {
  it('keeps every lower-layout trigger volume clear of its guard solids', () => {
    const bounds = (box: Box) => ({
      min: box.center.map((center, axis) => center - box.half[axis]!),
      max: box.center.map((center, axis) => center + box.half[axis]!),
    });
    for (const layout of Object.keys(LOWER_LAYOUTS)) {
      const def = FAMILIES.lower!.build({ layout });
      const finger = def.keepOuts.find(({ id }) => id === 'trigger-finger')!.box;
      const fingerBounds = bounds(finger);
      const guards = def.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
      expect(guards.length, `${layout} has trigger guard solids`).toBeGreaterThan(0);
      for (const guard of guards) {
        const [min, max] = localSolidBounds(guard);
        const separated = [0, 1, 2].some(
          (axis) => max[axis]! <= fingerBounds.min[axis]! || fingerBounds.max[axis]! <= min[axis]!,
        );
        expect(separated, `${layout} ${guard.id} clears the trigger volume`).toBe(true);
      }
    }
  });

  // Replaces the former CI-only seed sweep (PROJECT.md, "Generator tests", removal plan (a)): the
  // property is checked on every non-broken fixture and every published design. broken-trigger-guard
  // and the other broken-* fixtures are skipped: they exist to break a rule.
  // Checks trigger-guard clearance across every fixture and published design.
  it('guards the trigger volume in every fixture and design', { timeout: 20_000 }, () => {
    const corpus = loadCorpus();
    expect(corpus.length).toBeGreaterThan(0);
    for (const { label, assembly } of corpus) {
      const report = validate(assembly, gunDomain);
      const triggerOwners = [...report.resolved.defs].filter(([, def]) =>
        def.keepOuts.some(({ id }) => id === 'trigger-finger'),
      );
      if ([...report.resolved.defs.values()].some((def) => def.family === 'revolver-frame')) {
        // The revolver's open ten-prism bow is validated by its own solid rule, not a box keep-out.
        expect(triggerOwners).toEqual([]);
        expect(report.issues.filter(({ rule }) => rule === 'trigger-guard')).toEqual([]);
        expect(report.issues.filter(({ rule }) => rule === 'revolver-trigger-bow')).toEqual([]);
        continue;
      }
      expect(triggerOwners.length, label).toBeGreaterThan(0);
      for (const [part, def] of triggerOwners) {
        const guards = def.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
        expect(guards.length, `${label} ${part} has trigger guard solids`).toBeGreaterThan(0);
      }
      expect(
        report.issues.filter(({ rule }) => rule === 'trigger-guard'),
        label,
      ).toEqual([]);
    }
  });

  it('reports a broken assembly without its trigger guard', () => {
    const report = validate(loadFixture('broken-trigger-guard'), gunDomain);
    expect(report.issues.filter(({ rule }) => rule === 'trigger-guard').map(({ message }) => message)).toEqual([
      'lower has a trigger-finger volume but is missing its enclosing trigger guard.',
    ]);
  });
});
