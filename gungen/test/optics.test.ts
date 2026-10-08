import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { distanceWorld, localSolidBounds, obbPolyhedron, penetrationWorld, worldSolid } from '../src/core/geometry.ts';
import { applyPoint, IDENTITY, invert, type Transform } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { PartDef } from '../src/core/schema.ts';
import type { Template } from '../src/core/template.ts';
import { validate } from '../src/core/validate.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
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
const TUBULAR_SOLID_ID = /tube|bell|turret|housing|ring-band/;

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
    const bounds = optic.solids.map(localSolidBounds);
    const actual = [0, 1, 2].map(
      (axis) => Math.max(...bounds.map(([, max]) => max[axis]!)) - Math.min(...bounds.map(([min]) => min[axis]!)),
    );
    expect(actual).toEqual(optic.envelopeU);
  });

  it('gives the closed micro dot a rear-to-front tunnel and two rear-left adjustment dials', () => {
    const optic = getOptic('mini-reflex');
    expect(optic.reference).toContain('ACRO');
    const dials = optic.solids.filter(({ id }) => id.includes('adjustment-dial'));
    expect(dials).toHaveLength(2);
    for (const dial of dials) {
      expect(dial.kind).toBe('revolved');
      const [, max] = localSolidBounds(dial);
      expect(max[0]).toBeLessThan(0);
      expect(max[2]).toBeLessThan(0);
    }
    // The rear, middle and front all have four walls; deleting most of the housing must not pass as a tunnel.
    for (const x of [-2, 0, 1.75]) {
      for (const [y, z] of [
        [0.75, 0],
        [2.5, 0],
        [1.5, -1],
        [1.5, 1],
      ]) {
        const wallProbe = worldSolid(IDENTITY, {
          id: 'wall-probe',
          kind: 'box',
          box: { center: [x, y!, z!], half: [0.1, 0.1, 0.1] },
        });
        expect(
          optic.solids.some((solid) => penetrationWorld(wallProbe, worldSolid(IDENTITY, solid)) > 0),
          `wall at ${x},${y},${z}`,
        ).toBe(true);
      }
    }
    const probe = worldSolid(IDENTITY, {
      id: 'window-probe',
      kind: 'box',
      box: { center: [0, optic.opticalAxisY, 0], half: [2.5, 0.25, 0.25] },
    });
    for (const solid of optic.solids) {
      expect(penetrationWorld(probe, worldSolid(IDENTITY, solid)), solid.id).toBeLessThanOrEqual(0);
    }
  });

  it('gives the fixed prism smaller round ocular and flared objective ends around a squat chamfered body', () => {
    const optic = getOptic('fixed-prism-4x');
    const find = (id: string) => {
      const solid = optic.solids.find((candidate) => candidate.id === id);
      if (!solid) {
        throw new Error(`missing prism solid ${id}`);
      }
      return solid;
    };
    const objective = find('objective-bell');
    const ocular = find('ocular-bell');
    expect(objective.kind).toBe('revolved');
    expect(ocular.kind).toBe('revolved');
    const [omin, omax] = localSolidBounds(objective);
    const [rmin, rmax] = localSolidBounds(ocular);
    const housing = find('prism-housing');
    expect(housing.kind).toBe('extruded-polygon');
    if (housing.kind === 'extruded-polygon') {
      expect(housing.profile.length).toBeGreaterThanOrEqual(6);
    }
    const [hmin, hmax] = localSolidBounds(housing);
    expect(hmax[2] - hmin[2]).toBeGreaterThan(omax[2] - omin[2]);
    expect(hmax[1] - hmin[1]).toBeGreaterThan(omax[1] - omin[1]);
    expect(omax[0]).toBeGreaterThan(hmax[0]);
    expect(rmin[0]).toBeLessThan(hmin[0]);
    expect(rmax[2] - rmin[2]).toBeLessThan(omax[2] - omin[2]);
    expect(find('elevation-cap').kind).toBe('revolved');
    expect(find('windage-cap').kind).toBe('revolved');
    expect(find('mount-cross-bolt').kind).toBe('revolved');
  });

  it('keeps low LPVO and high-mag objective bell gaps between 2 and 3 mm above the mounting plane', () => {
    for (const type of ['lpvo-1-6x', 'high-mag-5-25x']) {
      const optic = getOptic(type);
      const body = optic.solids.find(({ id }) => id === 'tube-with-flared-bells')!;
      const gapMm = localSolidBounds(body)[0][1] * 11.5;
      expect(gapMm, type).toBeGreaterThanOrEqual(2);
      expect(gapMm, type).toBeLessThanOrEqual(3);
    }
  });

  it('models tubular optics, rings and adjustment turrets as revolved solids', () => {
    const solids = [
      ...getOptic('tube-dot').solids.filter(({ id }) => id === 'tube-body'),
      ...getOptic('lpvo-1-6x').solids.filter(({ id }) => TUBULAR_SOLID_ID.test(id)),
      ...getOptic('high-mag-5-25x').solids.filter(({ id }) => TUBULAR_SOLID_ID.test(id)),
      ...getOptic('digital-thermal').solids.filter(({ id }) => TUBULAR_SOLID_ID.test(id)),
    ];
    for (const type of ['lpvo-1-6x', 'high-mag-5-25x', 'digital-thermal']) {
      expect(getOptic(type).solids.map(({ id }) => id)).toEqual(
        expect.arrayContaining(['rear-ring-band', 'front-ring-band']),
      );
    }
    for (const solid of solids) {
      expect(solid.kind, solid.id).toBe('revolved');
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
  sightDef,
  solids,
  railY,
  hostTransform,
  sightTransform,
}: {
  readonly assembly: MutableAssembly;
  readonly opticId: string;
  readonly sightDef: PartDef;
  readonly solids: readonly (readonly (readonly [number, number])[])[];
  readonly railY: number;
  readonly hostTransform: Transform;
  readonly sightTransform: Transform;
}): void => {
  const contactSolids = sightDef.solids.filter((solid) => solid.id.endsWith('foot'));
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

const expectContactOnPhysicalRail = (assembly: MutableAssembly, opticId: string, domain = gunDomain): void => {
  const resolved = resolve(assembly, domain);
  ensure(resolved.issues.length === 0, `${assembly.name} structure: ${JSON.stringify(resolved.issues)}`);
  const connection = assembly.connections.find(({ to }) => to === 'sight.base');
  ensure(connection !== undefined, `${assembly.name} has no optic connection`);
  const [hostId, portId] = connection.from.split('.');
  ensure(hostId !== undefined && portId !== undefined, `${assembly.name} has malformed optic mount ${connection.from}`);
  if (assembly.name.startsWith('pistol-')) {
    ensure(hostId === 'slide', 'pistol optic must use the slide top rail');
  }
  ensure(
    (hostId === 'receiver' || hostId === 'slide') && portId === 'rail',
    `${assembly.name} optic must use receiver.rail, not ${connection.from}`,
  );
  const host = resolved.defs.get(hostId);
  const hostTransform = resolved.placed.get(hostId);
  const sightTransform = resolved.placed.get('sight');
  const sightDef = resolved.defs.get('sight');
  const port = host?.ports.find(({ id }) => id === portId);
  ensure(
    host !== undefined &&
      hostTransform !== undefined &&
      sightTransform !== undefined &&
      sightDef !== undefined &&
      port !== undefined,
    `${assembly.name} optic placement is unresolved`,
  );
  ensure(port.mount === 'rail-top', `${assembly.name} receiver.rail is not a top rail`);
  const [, railY] = port.pos;
  // Receiver body, independent of a rail that might extend beyond it.
  const bodyBounds = host.solids
    .filter(({ id }) => (host.family === 'slide' || id.startsWith('receiver-')) && !id.includes('rail'))
    .map(localSolidBounds);
  const bodyX = [Math.min(...bodyBounds.map(([min]) => min[0])), Math.max(...bodyBounds.map(([, max]) => max[0]))];
  for (const foot of sightDef.solids.filter((solid) => solid.id.endsWith('foot'))) {
    for (const corner of localSolidBounds(foot)) {
      const [x] = applyPoint(invert(hostTransform), applyPoint(sightTransform, corner));
      ensure(
        x >= bodyX[0]! - 1e-6 && x <= bodyX[1]! + 1e-6,
        `${assembly.name} ${opticId} foot outside receiver body X extent`,
      );
    }
  }
  const topFaces = physicalTopFaces(host, railY);
  ensure(topFaces.length > 0, `${assembly.name} receiver has no physical top solid at its rail`);
  assertMountFeetSupported({ assembly, opticId, sightDef, solids: topFaces, railY, hostTransform, sightTransform });
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
  { template: pumpShotgun, seed: 4, types: OPTIC_TYPE_IDS.slice(0, 3) },
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

describe('authored front-bead contact', () => {
  const designsDir = join(import.meta.dirname, '..', 'designs');
  const designs = readdirSync(designsDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const loaded = loadGunDesign(readFileSync(join(designsDir, file), 'utf8'));
      if (!loaded.ok) {
        throw new Error(`${file}: ${loaded.error.message}`);
      }
      return { file, assembly: loaded.design.assembly };
    })
    .filter(({ assembly }) => Object.values(assembly.parts).some(({ family }) => family === 'front-sight-bead'));

  it('keeps every authored bead in contact with its connected host', () => {
    expect(designs.length).toBeGreaterThan(0);
    for (const { file, assembly } of designs) {
      const resolved = resolve(assembly, gunDomain);
      const [beadId] = Object.entries(assembly.parts).find(([, part]) => part.family === 'front-sight-bead') ?? [];
      const connection = beadId && assembly.connections.find(({ to }) => to === `${beadId}.base`);
      if (!(beadId && connection)) {
        throw new Error(`${file}: front bead has no connected host`);
      }
      const [hostId] = connection.from.split('.');
      if (!hostId) {
        throw new Error(`${file}: front bead host id is empty`);
      }
      const host = resolved.defs.get(hostId);
      const hostTransform = resolved.placed.get(hostId);
      const beadTransform = resolved.placed.get(beadId);
      if (!(host && hostTransform && beadTransform)) {
        throw new Error(`${file}: front bead or host is unresolved`);
      }
      const beadSolids = resolved.defs.get(beadId)!.solids;
      expect(beadSolids.length, `${file} bead solids`).toBeGreaterThan(0);
      expect(host.solids.length, `${file} ${hostId} solids`).toBeGreaterThan(0);
      const gap = Math.min(
        ...beadSolids.flatMap((bead) =>
          host.solids.map((solid) => distanceWorld(worldSolid(beadTransform, bead), worldSolid(hostTransform, solid))),
        ),
      );
      expect(gap, `${file} bead to ${hostId}`).toBeLessThanOrEqual(1e-6);
    }
  });
});

describe('curated optic mounts', () => {
  it('keeps published designs receiver-mounted and valid when only the optic type is swapped', () => {
    const designs = [
      ['archetype-battle-rifle', OPTIC_TYPE_IDS.slice(0, 6)],
      ['archetype-ar', OPTIC_TYPE_IDS.slice(0, 5)],
      ['archetype-ar-free-float', OPTIC_TYPE_IDS.slice(0, 5)],
      ['archetype-bolt-rifle', OPTIC_TYPE_IDS.slice(3)],
      ['archetype-bolt-rifle-box', OPTIC_TYPE_IDS.slice(4)],
      ['archetype-awm', OPTIC_TYPE_IDS.slice(4)],
      ['archetype-smg', OPTIC_TYPE_IDS.slice(0, 3)],
      ['archetype-anti-materiel', ['high-mag-5-25x']],
    ] as const;
    for (const [name, types] of designs) {
      const { assembly } = JSON.parse(readFileSync(new URL(`../designs/${name}.json`, import.meta.url), 'utf8')) as {
        assembly: MutableAssembly;
      };
      for (const type of types) {
        assembly.parts.sight!.params = { type };
        expectContactOnPhysicalRail(assembly, type);
        expect(validate(assembly, gunDomain).issues, `${name} with ${type}`).toEqual([]);
      }
    }
  });

  it('uses two prism feet touching its round ends only on top-loaded hosts, without moving its body', () => {
    const assembly = fitOptic(boltRifle, 0, 'fixed-prism-4x');
    const report = validate(assembly, gunDomain);
    expect(report.issues).toEqual([]);
    const top = report.resolved.defs.get('sight')!;
    const closed = FAMILIES.sight!.build({ type: 'fixed-prism-4x', mountFeed: 'box' });
    expect(closed.solids.some(({ id }) => id === 'mount-bridge')).toBe(true);
    expect(top.solids.some(({ id }) => id === 'mount-bridge')).toBe(false);
    expect(top.axes).toEqual(closed.axes);
    const body = (def: PartDef) => def.solids.filter(({ id }) => !id.endsWith('foot') && id !== 'mount-bridge');
    expect(body(top)).toEqual(body(closed));
    const feet = top.solids.filter(({ id }) => id.endsWith('foot'));
    expect(feet).toHaveLength(2);
    for (const foot of feet) {
      const endId = foot.id.startsWith('rear') ? 'ocular-bell' : 'objective-bell';
      const end = top.solids.find(({ id }) => id === endId)!;
      expect(distanceWorld(worldSolid(IDENTITY, foot), worldSolid(IDENTITY, end))).toBeLessThanOrEqual(1e-6);
    }
    expectContactOnPhysicalRail(assembly, 'fixed-prism-4x');
  });

  it('leaves the top-loading opening empty at the receiver top, between the two scope bases', () => {
    const receiver = FAMILIES.receiver!.build({ action: 'bolt', feed: 'top', bore: 'M' });
    const opening = worldSolid(IDENTITY, {
      id: 'opening',
      kind: 'box',
      box: { center: [-6.5, 2.5, 0], half: [2.49, 0.1, 1.49] },
    });
    for (const solid of receiver.solids) {
      expect(penetrationWorld(opening, worldSolid(IDENTITY, solid)), solid.id).toBeLessThanOrEqual(0);
    }
  });
});

describe('optic incompatibility validation', () => {
  it.each(['base-above-mouth', 'ring-above-mouth', 'body-through-mouth'] as const)(
    'rejects actual %s geometry inside the loading footprint after a green nominal control',
    (fault) => {
      const assembly = fitOptic(boltRifle, 0, 'high-mag-5-25x');
      expect(validate(assembly, gunDomain).issues).toEqual([]);
      const original = FAMILIES.sight!;
      let consumed = false;
      const domain = {
        ...gunDomain,
        families: {
          ...gunDomain.families,
          sight: {
            ...original,
            build(params: Readonly<Record<string, string>>) {
              consumed = true;
              const def = original.build(params);
              const blocker = {
                id: {
                  'body-through-mouth': 'tube-with-flared-bells',
                  'ring-above-mouth': 'rear-ring-band',
                  'base-above-mouth': 'loading-base',
                }[fault],
                kind: 'box' as const,
                box: {
                  center: [1.5, fault === 'body-through-mouth' ? -0.25 : 0.75, 0] as const,
                  half: [2.4, 0.2, 0.5] as const,
                },
              };
              return { ...def, solids: [...def.solids.filter(({ id }) => id !== blocker.id), blocker] };
            },
          },
        },
      };
      const report = validate(assembly, domain);
      expect(consumed).toBe(true);
      expect(report.issues.some(({ rule }) => rule === 'keep-out')).toBe(true);
      expect(report.resolved.defs.get('sight')!.ports).toEqual(resolve(assembly, gunDomain).defs.get('sight')!.ports);
    },
  );

  it.each(['floating', 'missing-one', 'missing-all'] as const)(
    'rejects actual sight.build %s feet with unchanged catalog, ports and axes',
    (fault) => {
      const type = fault === 'missing-one' ? 'high-mag-5-25x' : 'mini-reflex';
      const assembly = fitOptic(fault === 'missing-one' ? boltRifle : ar, 0, type);
      const baseline = validate(assembly, gunDomain);
      expect(baseline.issues).toEqual([]);
      expectContactOnPhysicalRail(assembly, type);
      const original = FAMILIES.sight!;
      let consumed = false;
      const domain = {
        ...gunDomain,
        families: {
          ...gunDomain.families,
          sight: {
            ...original,
            build(params: Readonly<Record<string, string>>) {
              consumed = true;
              const def = original.build(params);
              const solids =
                fault === 'floating'
                  ? def.solids.map((solid) =>
                      solid.kind === 'box' && solid.id.endsWith('foot')
                        ? {
                            ...solid,
                            box: {
                              ...solid.box,
                              center: [solid.box.center[0], solid.box.center[1] + 0.125, solid.box.center[2]] as const,
                            },
                          }
                        : solid,
                    )
                  : def.solids.filter(({ id }) =>
                      fault === 'missing-one' ? id !== 'rear-ring-foot' : !id.endsWith('foot'),
                    );
              return { ...def, solids };
            },
          },
        },
      };
      const report = validate(assembly, domain);
      expect(consumed).toBe(true);
      expect(report.resolved.defs.get('sight')!.ports).toEqual(baseline.resolved.defs.get('sight')!.ports);
      expect(report.resolved.defs.get('sight')!.axes).toEqual(baseline.resolved.defs.get('sight')!.axes);
      expect(report.issues.filter(({ rule }) => rule === 'optic-mount-fit')).toHaveLength(1);
      if (fault === 'floating') {
        expect(() => expectContactOnPhysicalRail(assembly, type, domain)).toThrow('contact is not on');
      }
    },
  );

  it('rejects a receiver-named rail reaching over the forend instead of the receiver body', () => {
    const assembly = fitOptic(ar, 0, 'tube-dot');
    const receiver = gunDomain.families.receiver!;
    const domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        receiver: {
          ...receiver,
          build: (params: Readonly<Record<string, string>>) => {
            const def = receiver.build(params);
            return {
              ...def,
              ports: def.ports.map((port) =>
                port.id === 'rail' ? { ...port, pos: [port.pos[0] + 16, port.pos[1], port.pos[2]] as const } : port,
              ),
              solids: def.solids.map((solid) =>
                solid.id === 'receiver-optic-rail' && solid.kind === 'box'
                  ? {
                      ...solid,
                      box: {
                        ...solid.box,
                        center: [solid.box.center[0] + 16, solid.box.center[1], solid.box.center[2]] as const,
                      },
                    }
                  : solid,
              ),
            };
          },
        },
      },
    };
    const issues = validate(assembly, domain).issues.filter(({ rule }) => rule === 'optic-mount-fit');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('beyond the receiver body');
  });

  it('rejects a compact foot suspended over the top-loading opening despite matching rail metadata', () => {
    const assembly = fitOptic(boltRifle, 0, 'high-mag-5-25x');
    assembly.parts.sight!.params = { type: 'mini-reflex' };
    const issues = validate(assembly, gunDomain).issues.filter(({ rule }) => rule === 'optic-mount-fit');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('not supported');
  });

  it('rejects a rail over the handguard even when the compact footprint fits it', () => {
    const assembly = fitOptic(ar, 0, 'tube-dot');
    assembly.connections = assembly.connections.map((connection) =>
      connection.to === 'sight.base' ? { ...connection, from: 'handguard.rail', slot: 3 } : connection,
    );
    expect(validate(assembly, gunDomain).issues.map(({ rule }) => rule)).toContain('optic-mount-fit');
  });

  it('rejects a 12u scope on the pistol slide rail and a long optic without a cheek datum', () => {
    const assembly = fitOptic(pistol, 0, 'mini-reflex');
    assembly.parts.sight!.params = { ...assembly.parts.sight!.params, type: 'high-mag-5-25x' };
    const report = validate(assembly, gunDomain);
    expect(report.issues.map(({ rule }) => rule)).toContain('optic-mount-fit');
    expect(report.issues.map(({ rule }) => rule)).toContain('optic-eye-relief');
  });
});
