import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { obbPolyhedron, worldSolid } from '../src/core/geometry.ts';
import { applyPoint, IDENTITY, invert, type Transform } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { PartDef } from '../src/core/schema.ts';
import type { Template } from '../src/core/template.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { MOUNT_KINDS, MOUNT_STANDARDS, mountCanAccept } from '../src/gun/mounts.ts';
import { getOptic, OPTIC_CATALOG, OPTIC_TYPE_IDS } from '../src/gun/optics.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import {
  antiMateriel,
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
const TUBULAR_SOLID_ID = /tube|bell|turret|housing/;
const MOUNT_SOLID_ID = /foot|mount/;

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

  it('keeps the BR reference proportions and the mini-reflex to one window prism plus foot', () => {
    expect(getOptic('mini-reflex').solids.map(({ id }) => id)).toEqual(['mount-foot', 'front-window-prism']);
    expect(getOptic('holographic')).toMatchObject({ envelopeMm: [95, 56, 65], envelopeU: [8.25, 4.875, 5.75] });
    expect(getOptic('fixed-prism-4x')).toMatchObject({ envelopeMm: [150, 45, 60], envelopeU: [13, 4, 5.25] });
  });

  it('models tubular optics and adjustment turrets as octagonal extrusions, not boxes', () => {
    const solids = [
      ...getOptic('tube-dot').solids.filter(({ id }) => id === 'tube-body'),
      ...getOptic('lpvo-1-6x').solids.filter(({ id }) => TUBULAR_SOLID_ID.test(id)),
      ...getOptic('high-mag-5-25x').solids.filter(({ id }) => TUBULAR_SOLID_ID.test(id)),
      ...getOptic('digital-thermal').solids.filter(({ id }) => TUBULAR_SOLID_ID.test(id)),
    ];
    expect(solids.length).toBeGreaterThan(0);
    for (const solid of solids) {
      expect(solid.kind, solid.id).toBe('extruded-polygon');
      if (solid.kind === 'extruded-polygon') {
        expect(solid.profile, solid.id).toHaveLength(8);
      }
    }
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
  const candidateSlot = connection?.slot;
  let slot: number | undefined;
  if (typeof candidateSlot === 'number') {
    slot = candidateSlot;
  } else {
    const [firstSlot] = Array.isArray(candidateSlot) ? candidateSlot : [];
    if (typeof firstSlot === 'number') {
      slot = firstSlot;
    }
  }
  if (!connection || slot === undefined) {
    throw new Error(`${template.name} has no numeric sight mount for ${type}`);
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

const ensure: (condition: boolean, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const physicalTopFaces = (host: PartDef, railY: number) =>
  host.solids.flatMap((solid) => {
    const shape = worldSolid(IDENTITY, solid);
    const polyhedron = 'vertices' in shape ? shape : obbPolyhedron(shape);
    return polyhedron.faces.flatMap((indices) => {
      const points = indices.map((index) => polyhedron.vertices[index]!);
      return points.every((point) => Math.abs(point[1] - railY) < 1e-6)
        ? [points.map(([x, , z]) => [x, z] as const)]
        : [];
    });
  });

const pointOnTopFace = (point: readonly [number, number], face: readonly (readonly [number, number])[]): boolean => {
  const signs = face.map(([vertexX, vertexZ], index) => {
    const [nextX, nextZ] = face[(index + 1) % face.length]!;
    return (nextX - vertexX) * (point[1] - vertexZ) - (nextZ - vertexZ) * (point[0] - vertexX);
  });
  return signs.every((sign) => sign >= -1e-6) || signs.every((sign) => sign <= 1e-6);
};

const assertMountFeetSupported = ({
  assembly,
  opticId,
  solids,
  railY,
  hostTransform,
  sightTransform,
}: {
  readonly assembly: MutableAssembly;
  readonly opticId: string;
  readonly solids: readonly (readonly (readonly [number, number])[])[];
  readonly railY: number;
  readonly hostTransform: Transform;
  readonly sightTransform: Transform;
}): void => {
  const contactSolids = getOptic(opticId).solids.filter(
    (solid) => solid.kind === 'box' && MOUNT_SOLID_ID.test(solid.id),
  );
  ensure(contactSolids.length > 0, `${opticId} has no physical mount feet`);
  const toHost = invert(hostTransform);
  for (const solid of contactSolids) {
    if (solid.kind !== 'box') {
      continue;
    }
    const { center, half } = solid.box;
    for (const sampleX of [-1, 0, 1]) {
      for (const sampleZ of [-1, 0, 1]) {
        const world = applyPoint(sightTransform, [
          center[0] + sampleX * half[0],
          center[1] - half[1],
          center[2] + sampleZ * half[2],
        ]);
        const local = applyPoint(toHost, world);
        ensure(
          Math.abs(local[1] - railY) <= 1e-5,
          `${assembly.name} ${opticId} contact is not on the receiver rail plane`,
        );
        ensure(
          solids.some((face) => pointOnTopFace([local[0], local[2]], face)),
          `${assembly.name} ${opticId} contact (${local.map((n) => n.toFixed(2)).join(',')}) is not over an actual receiver top solid`,
        );
      }
    }
  }
};

const expectContactOnPhysicalRail = (assembly: MutableAssembly, opticId: string): void => {
  const resolved = resolve(assembly, gunDomain);
  ensure(resolved.issues.length === 0, `${assembly.name} structure: ${JSON.stringify(resolved.issues)}`);
  const connection = assembly.connections.find(({ to }) => to === 'sight.base');
  ensure(connection !== undefined, `${assembly.name} has no optic connection`);
  const [hostId, portId] = connection.from.split('.');
  ensure(hostId !== undefined && portId !== undefined, `${assembly.name} has malformed optic mount ${connection.from}`);
  if (assembly.name.startsWith('pistol-')) {
    ensure(hostId === 'slide', 'pistol optic must use the slide top rail');
    return;
  }
  ensure(
    hostId === 'receiver' && portId === 'rail',
    `${assembly.name} optic must use receiver.rail, not ${connection.from}`,
  );
  const host = resolved.defs.get(hostId);
  const hostTransform = resolved.placed.get(hostId);
  const sightTransform = resolved.placed.get('sight');
  const port = host?.ports.find(({ id }) => id === portId);
  ensure(
    host !== undefined && hostTransform !== undefined && sightTransform !== undefined && port !== undefined,
    `${assembly.name} optic placement is unresolved`,
  );
  ensure(port.mount === 'rail-top', `${assembly.name} receiver.rail is not a top rail`);
  const [, railY] = port.pos;
  const topFaces = physicalTopFaces(host, railY);
  ensure(topFaces.length > 0, `${assembly.name} receiver has no physical top solid at its rail`);
  assertMountFeetSupported({ assembly, opticId, solids: topFaces, railY, hostTransform, sightTransform });
};

const FIT_CASES = [
  { template: battleRifle, seed: 0, types: OPTIC_TYPE_IDS.slice(0, 6) },
  { template: antiMateriel, seed: 0, types: ['high-mag-5-25x'] },
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
        expectContactOnPhysicalRail(assembly, type);
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
