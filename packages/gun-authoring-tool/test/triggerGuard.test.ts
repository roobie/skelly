import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PartDef } from '@skelly/engine/assembly/schema.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { IDENTITY } from '@skelly/engine/foundation/math.ts';
import {
  localSolidBounds,
  penetrationWorld,
  validateExtrudedPolygon,
  worldSolid,
} from '@skelly/engine/shapes/geometry.ts';
import type { Box, Solid } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
import recipe from '../exports/deadvox.json' with { type: 'json' };
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, LOWER_LAYOUTS } from '../src/gun/parts.ts';
import { isTriggerBlade, OPEN_TRIGGER_GUARD } from '../src/gun/roundedTriggerGuard.ts';
import { TRIGGER_GUARDS } from '../src/gun/triggerGuards.ts';
import { loadCorpus, loadFixture } from './helpers.ts';

const ROOT = resolve(import.meta.dirname, '../../..');

/** The part has trigger blades, and each one lies in its finger space. */
const hasPlacedTrigger = (def: PartDef): boolean => {
  const finger = worldSolid(IDENTITY, {
    id: 'finger',
    kind: 'box',
    box: def.keepOuts.find(({ id }) => id === 'trigger-finger')!.box,
  });
  const blades = def.solids.filter(({ id }) => isTriggerBlade(id));
  return blades.length > 0 && blades.every((blade) => penetrationWorld(worldSolid(IDENTITY, blade), finger) > 1e-8);
};

// The lower each content block shapes.
const CONTENT_LOWERS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  ak: { layout: 'ak' },
  'ar-small': { layout: 'ar', actionFrame: 'small' },
  'ar-large': { layout: 'ar', actionFrame: 'large', magazineProfile: 'sr25-straight' },
  conventional: { layout: 'conventional' },
};
const lowerBuilds = () => [
  ...Object.keys(LOWER_LAYOUTS).map((layout) => ({ label: layout, params: { layout } })),
  ...Object.entries(CONTENT_LOWERS).map(([label, params]) => ({ label, params })),
];

describe('trigger guards', () => {
  it('matches each lower guard membership to its open tag', () => {
    for (const { label, params } of lowerBuilds()) {
      const def = FAMILIES.lower!.build(params);
      const guards = def.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
      const open = def.tags?.includes(OPEN_TRIGGER_GUARD) ?? false;
      expect(guards.map(({ id }) => id).sort(), label).toEqual(
        (open
          ? ['trigger-guard-front', 'trigger-guard-bottom', 'trigger-guard-corner']
          : ['trigger-guard-top', 'trigger-guard-rear', 'trigger-guard-front', 'trigger-guard-bottom']
        ).sort(),
      );
    }
  });
  it.each(Object.keys(TRIGGER_GUARDS))('builds valid open pieces with content-owned thickness for %s', (key) => {
    expect(CONTENT_LOWERS[key], `${key} has a lower to build`).toBeDefined();
    const def = FAMILIES.lower!.build(CONTENT_LOWERS[key]!);
    expect(def.tags).toContain(OPEN_TRIGGER_GUARD);
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
    expect(bar[1][1] - bar[0][1]).toBeCloseTo(TRIGGER_GUARDS[key]!.wallU);
    expect(front[1][0] - front[0][0]).toBeCloseTo(TRIGGER_GUARDS[key]!.wallU);
  });
  it('keeps every lower-layout trigger volume clear of its guard solids', () => {
    const bounds = (box: Box) => ({
      min: box.center.map((center, axis) => center - box.half[axis]!),
      max: box.center.map((center, axis) => center + box.half[axis]!),
    });
    for (const { label, params } of lowerBuilds()) {
      const def = FAMILIES.lower!.build(params);
      const finger = def.keepOuts.find(({ id }) => id === 'trigger-finger')!.box;
      const fingerBounds = bounds(finger);
      const guards = def.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
      expect(guards.length, `${label} has trigger guard solids`).toBeGreaterThan(0);
      for (const guard of guards) {
        const [min, max] = localSolidBounds(guard);
        const separated = [0, 1, 2].some(
          (axis) => max[axis]! <= fingerBounds.min[axis]! || fingerBounds.max[axis]! <= min[axis]!,
        );
        expect(separated, `${label} ${guard.id} clears the trigger volume`).toBe(true);
      }
    }
  });

  it('gives every exported gun a trigger', () => {
    const designs = recipe.filter(({ kind }) => kind === 'design');
    expect(designs.length).toBeGreaterThan(0);
    for (const { source } of designs) {
      const loaded = loadGunDesign(readFileSync(resolve(ROOT, source), 'utf8'));
      if (!loaded.ok) {
        throw new Error(source);
      }
      const defs = [...validate(loaded.design.assembly, gunDomain).resolved.defs.values()];
      if (defs.some((def) => def.family === 'revolver-frame')) {
        // The revolver's trigger is its own part, moved by the action rather than placed in a finger volume.
        expect(
          defs.some((def) => def.family === 'revolver-trigger' && def.solids.length > 0),
          source,
        ).toBe(true);
        continue;
      }
      const owners = defs.filter((def) => def.keepOuts.some(({ id }) => id === 'trigger-finger'));
      expect(owners.length, source).toBeGreaterThan(0);
      for (const def of owners) {
        expect(hasPlacedTrigger(def), `${source} has a trigger blade in its finger space`).toBe(true);
      }
    }
  });
  it('does not take an unrelated solid in the finger space for a trigger', () => {
    const lower = FAMILIES.lower!.build({ layout: 'ar' });
    expect(hasPlacedTrigger(lower)).toBe(true);
    const finger = lower.keepOuts.find(({ id }) => id === 'trigger-finger')!.box;
    const obstruction: Solid = {
      id: 'receiver-obstruction',
      kind: 'box',
      box: { ...finger, half: [finger.half[0] * 0.8, finger.half[1] * 0.8, finger.half[2] * 0.8] },
    };
    const solids = [...lower.solids.filter(({ id }) => !isTriggerBlade(id)), obstruction];
    expect(hasPlacedTrigger({ ...lower, solids })).toBe(false);
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
