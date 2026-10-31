import { validate } from '@skelly/engine/assembly/validate.ts';
import { localSolidBounds, validateExtrudedPolygon } from '@skelly/engine/shapes/geometry.ts';
import type { Box } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, LOWER_LAYOUTS } from '../src/gun/parts.ts';
import { OPEN_TRIGGER_GUARD } from '../src/gun/roundedTriggerGuard.ts';
import { TRIGGER_GUARDS } from '../src/gun/triggerGuards.ts';
import { loadCorpus, loadFixture } from './helpers.ts';

describe('trigger guards', () => {
  it('selects open membership for AK and keeps every other lower on the closed path', () => {
    for (const layout of Object.keys(LOWER_LAYOUTS)) {
      const def = FAMILIES.lower!.build({ layout });
      const guards = def.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
      const open = layout === 'ak';
      expect(def.tags?.includes(OPEN_TRIGGER_GUARD) ?? false, layout).toBe(open);
      expect(guards.map(({ id }) => id).sort(), layout).toEqual(
        (open
          ? ['trigger-guard-front', 'trigger-guard-bottom', 'trigger-guard-corner']
          : ['trigger-guard-top', 'trigger-guard-rear', 'trigger-guard-front', 'trigger-guard-bottom']
        ).sort(),
      );
    }
  });
  it('builds valid AK pieces with content-owned thickness', () => {
    const def = FAMILIES.lower!.build({ layout: 'ak' });
    const guards = def.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
    expect(guards.length).toBeGreaterThan(0);
    for (const guard of guards) {
      if (guard.kind === 'box') {
        const [min, max] = localSolidBounds(guard);
        expect(min.every((value, axis) => Number.isFinite(value) && value < max[axis]!)).toBe(true);
        expect(max.every(Number.isFinite)).toBe(true);
      } else {
        expect(guard.kind).toBe('extruded-polygon');
        if (guard.kind !== 'extruded-polygon') {
          throw new Error('Expected polygon');
        }
        expect(guard.profile.length).toBeGreaterThan(0);
        expect(validateExtrudedPolygon(guard.profile, guard.z)).toBeUndefined();
      }
    }
    const bar = localSolidBounds(guards.find(({ id }) => id === 'trigger-guard-bottom')!);
    const front = localSolidBounds(guards.find(({ id }) => id === 'trigger-guard-front')!);
    expect(bar[1][1] - bar[0][1]).toBeCloseTo(TRIGGER_GUARDS.ak!.wallU);
    expect(front[1][0] - front[0][0]).toBeCloseTo(TRIGGER_GUARDS.ak!.wallU);
  });
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

  // Check trigger-guard clearance across valid fixtures and published designs; broken-* fixtures intentionally violate geometry rules.
  it('guards the trigger volume in every fixture and design', () => {
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
