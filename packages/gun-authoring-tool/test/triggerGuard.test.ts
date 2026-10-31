import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PartDef } from '@skelly/engine/assembly/schema.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { applyPoint, IDENTITY, invert } from '@skelly/engine/foundation/math.ts';
import {
  localSolidBounds,
  penetrationWorld,
  validateExtrudedPolygon,
  worldSolid,
} from '@skelly/engine/shapes/geometry.ts';
import type { Box, Solid } from '@skelly/engine/shapes/solid.ts';
import { describe, expect, it } from 'vitest';
import recipe from '../exports/deadvox.json' with { type: 'json' };
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, LOWER_LAYOUTS } from '../src/gun/parts.ts';
import { cornerGuardRear, isTriggerBlade } from '../src/gun/roundedTriggerGuard.ts';
import { triggerGuard } from '../src/gun/rules.ts';
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

describe('traced AR large lower and grip', () => {
  const report = () => {
    const loaded = loadGunDesign(
      readFileSync(resolve(ROOT, 'packages/gun-authoring-tool/designs/archetype-ar-large.json'), 'utf8'),
    );
    if (!loaded.ok) {
      throw new Error(loaded.error.message);
    }
    return validate(loaded.design.assembly, gunDomain);
  };
  it('hangs the trigger inside its corner guard', () => {
    const lower = report().resolved.defs.get('lower')!;
    expect(cornerGuardRear(lower.tags)).toBeDefined();
    expect(hasPlacedTrigger(lower)).toBe(true);
  });
  it("needs its lower's body to close the guard's rear it declares closed", () => {
    const { resolved } = report();
    const lower = resolved.defs.get('lower')!;
    expect(cornerGuardRear(lower.tags)).toBe('lower');
    expect(triggerGuard.check(resolved)).toEqual([]);
    const opened = { ...lower, solids: lower.solids.filter(({ id }) => id !== 'guard-lug') };
    expect(triggerGuard.check({ ...resolved, defs: new Map([...resolved.defs, ['lower', opened]]) })).not.toEqual([]);
  });
  it('builds the grip from valid convex pieces and keeps the firing hand inside its body', () => {
    const { resolved } = report();
    const grip = resolved.defs.get('grip')!;
    expect(grip.solids.length).toBeGreaterThan(0);
    for (const piece of grip.solids) {
      if (piece.kind !== 'extruded-polygon') {
        throw new Error(`${piece.id} is not a traced profile`);
      }
      expect(validateExtrudedPolygon(piece.profile, piece.z), piece.id).toBeUndefined();
    }
    const hold = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
    if ('code' in hold) {
      throw new Error(hold.code);
    }
    const [x, y, z] = applyPoint(invert(resolved.placed.get('grip')!), hold.hold.position);
    const body = grip.solids.find(({ id }) => id === 'body')!;
    if (body.kind !== 'extruded-polygon') {
      throw new Error('Expected a traced body');
    }
    const inside = body.profile.every(([x0, y0], index) => {
      const [x1, y1] = body.profile[(index + 1) % body.profile.length]!;
      return (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0) > 0;
    });
    expect(inside && z > body.z[0] && z < body.z[1]).toBe(true);
  });
});

describe('trigger guards', () => {
  it('matches each lower guard membership to its rear tag', () => {
    for (const { label, params } of lowerBuilds()) {
      const def = FAMILIES.lower!.build(params);
      const guards = def.solids.filter(({ id }) => id.startsWith('trigger-guard-'));
      const open = cornerGuardRear(def.tags) !== undefined;
      expect(guards.map(({ id }) => id).sort(), label).toEqual(
        (open
          ? ['trigger-guard-front', 'trigger-guard-bottom', 'trigger-guard-corner']
          : ['trigger-guard-top', 'trigger-guard-rear', 'trigger-guard-front', 'trigger-guard-bottom']
        ).sort(),
      );
    }
  });
  it.each(Object.keys(TRIGGER_GUARDS))('builds valid corner pieces with content-owned shape for %s', (key) => {
    expect(CONTENT_LOWERS[key], `${key} has a lower to build`).toBeDefined();
    const def = FAMILIES.lower!.build(CONTENT_LOWERS[key]!);
    expect(cornerGuardRear(def.tags)).toBe(TRIGGER_GUARDS[key]!.rear);
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
    expect(front[1][0] - front[0][0]).toBeCloseTo(TRIGGER_GUARDS[key]!.frontWallU ?? TRIGGER_GUARDS[key]!.wallU);
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
