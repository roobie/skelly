import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import type { Template } from '../src/core/template.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { MOUNT_KINDS, MOUNT_STANDARDS, mountCanAccept } from '../src/gun/mounts.ts';
import { getOptic, OPTIC_CATALOG, OPTIC_TYPE_IDS } from '../src/gun/optics.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import {
  ar,
  battleRifle,
  boltRifle,
  boltRifleBox,
  boltRifleThumbhole,
  pistol,
  pumpShotgun,
  smg,
} from '../src/gun/templates.ts';
import type { MutableAssembly } from './helpers.ts';

const HTTPS_URL = /^https:\/\//;

describe('optic catalog', () => {
  it('preserves stable ids as the sight type parameter values', () => {
    expect(FAMILIES.sight!.params.type!.values).toEqual(OPTIC_TYPE_IDS);
    expect(Object.keys(OPTIC_CATALOG)).toEqual(OPTIC_TYPE_IDS);
  });

  it.each(OPTIC_TYPE_IDS)('%s builds its declared generic mount and optical axis', (id) => {
    const optic = getOptic(id);
    const sight = FAMILIES.sight!.build({ type: id });
    expect(sight.solids.length, `${id} external envelope`).toBeGreaterThan(0);
    expect(sight.ports.find(({ id: port }) => port === 'base')).toMatchObject({ mount: optic.mount.kind });
    expect(sight.axes.find(({ kind }) => kind === 'sight')).toMatchObject({
      origin: [0, optic.opticalAxisY, 0],
      dir: [1, 0, 0],
    });
    expect(optic.source).toMatch(HTTPS_URL);
    expect(optic.envelopeMm.every((n) => n > 0)).toBe(true);
    expect(optic.envelopeU.every((n) => n > 0)).toBe(true);
  });
});

describe('generic rail mount fit', () => {
  const rail = FAMILIES.receiver!.build({ action: 'auto', feed: 'box', bore: 'M', rail: 'full' }).ports.find(
    ({ id }) => id === 'rail',
  )!;
  const highMag = getOptic('high-mag-5-25x').mount;

  it('requires enough length, slots, matching pitch, and support at the selected slot', () => {
    expect(rail.mount).toBe('rail-top');
    expect(MOUNT_STANDARDS['rail-top'].slotPitchU).toBe(2);
    expect(mountCanAccept(rail, highMag, 3)).toBe(true);
    expect(mountCanAccept(rail, highMag, 2)).toBe(false);
    expect(mountCanAccept({ ...rail, slots: { count: 6, pitch: 2 } }, highMag, 2)).toBe(false);
    expect(mountCanAccept({ ...rail, slots: { count: 7, pitch: 1.5 } }, highMag, 3)).toBe(false);
  });

  it('keeps #114’s threaded muzzle interface and supports the high-mag optic on its receiver rail', () => {
    const muzzle = FAMILIES.barrel!.build({ length: 'L', bore: 'L' }).ports.find(({ id }) => id === 'muzzle')!;
    const heavyRail = FAMILIES['heavy-receiver']!.build({ action: 'auto', feed: 'box', bore: 'L' }).ports.find(
      ({ id }) => id === 'rail',
    )!;
    expect(MOUNT_KINDS).toContain('muzzle');
    expect(MOUNT_STANDARDS.muzzle.family).toBe('thread');
    expect(muzzle.mount).toBe('muzzle');
    expect(heavyRail.mount).toBe('rail-top');
    expect(heavyRail.slots).toEqual({ count: 11, pitch: 2 });
    expect(mountCanAccept(heavyRail, highMag, 5)).toBe(true);
  });
});

const opticConnection = (template: Template, type: string) => {
  const candidates = template.connections.filter(
    ({ to, when }) => to === 'sight.base' && (!when || (when.param === 'type' && when.equals === type)),
  );
  const [connection] = candidates;
  const slot = connection?.slot;
  if (!connection || typeof slot !== 'number') {
    throw new Error(`${template.name} has no fixed sight mount for ${type}`);
  }
  return { ...connection, slot };
};

const fitOptic = (template: Template, seed: number, type: string): MutableAssembly => {
  const assembly = structuredClone(generate(template, gunDomain, seed)) as MutableAssembly;
  if (!assembly.parts.sight) {
    throw new Error(`${template.name} seed ${seed} did not include a sight`);
  }
  const connection = opticConnection(template, type);
  const candidates = typeof connection.from === 'string' ? [connection.from] : connection.from;
  const from = candidates.find((candidate) => assembly.parts[candidate.split('.')[0]!]);
  if (!from) {
    throw new Error(`${template.name} seed ${seed} lacks the ${connection.from} mount for ${type}`);
  }
  assembly.parts.sight.params = { ...assembly.parts.sight.params, type };
  assembly.connections = assembly.connections.filter(({ to }) => to !== 'sight.base');
  assembly.connections.push({ from, to: 'sight.base', slot: connection.slot });
  return assembly;
};

const FIT_CASES = [
  { template: battleRifle, seed: 0, types: OPTIC_TYPE_IDS.slice(0, 6) },
  { template: ar, seed: 0, types: OPTIC_TYPE_IDS.slice(0, 5) },
  { template: pistol, seed: 0, types: ['mini-reflex'] },
  { template: smg, seed: 0, types: OPTIC_TYPE_IDS.slice(0, 3) },
  { template: boltRifle, seed: 0, types: OPTIC_TYPE_IDS.slice(3) },
  { template: boltRifleBox, seed: 0, types: OPTIC_TYPE_IDS.slice(4) },
  { template: boltRifleThumbhole, seed: 0, types: OPTIC_TYPE_IDS.slice(4) },
  { template: pumpShotgun, seed: 1, types: OPTIC_TYPE_IDS.slice(0, 3) },
] as const;

describe('template optics can be attached, validated, and removed', () => {
  it.each(FIT_CASES)(
    '$template.name keeps one gun valid with every compatible optic type',
    ({ template, seed, types }) => {
      for (const type of types) {
        const assembly = fitOptic(template, seed, type);
        expect(validate(assembly, gunDomain).issues, `${template.name} with ${type}`).toEqual([]);
      }
      const generated = structuredClone(generate(template, gunDomain, seed)) as MutableAssembly;
      const { sight: _sight, ...remainingParts } = generated.parts;
      const removed: MutableAssembly = { ...generated, parts: remainingParts };
      removed.connections = removed.connections.filter(({ to }) => to !== 'sight.base');
      expect(validate(removed, gunDomain).issues, `${template.name} without its optional optic`).toEqual([]);
    },
  );
});

describe('optic incompatibility validation', () => {
  it('rejects a 12u scope on the pistol slide rail and a long optic without a cheek datum', () => {
    const assembly = fitOptic(pistol, 0, 'mini-reflex');
    assembly.parts.sight!.params = { ...assembly.parts.sight!.params, type: 'high-mag-5-25x' };
    const report = validate(assembly, gunDomain);
    expect(report.issues.map(({ rule }) => rule)).toContain('optic-mount-fit');
    expect(report.issues.map(({ rule }) => rule)).toContain('optic-eye-relief');
  });
});
