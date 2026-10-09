import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateValid } from '@skelly/engine/core/generate.ts';
import { localSolidBounds } from '@skelly/engine/core/geometry.ts';
import { partNodeName } from '@skelly/engine/core/glb.ts';
import { applyPoint } from '@skelly/engine/core/math.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import { keepOutBetweenParts, solidOverlapBetweenParts } from '@skelly/engine/core/rules.ts';
import type { Assembly, Domain, PartDef, PartFamily, PortDef } from '@skelly/engine/core/schema.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import validator from 'gltf-validator';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildRegistry } from '../../deadvox/src/core/content.ts';
import { AK_MAGAZINE_CALIBRE_BY_VARIANT, AK_MAGAZINE_VARIANT_BY_CALIBRE } from '../src/gun/akMagazineCalibre.ts';
import { attachmentCompatibility, attachmentCompatibilityPairs } from '../src/gun/attachmentCompatibility.ts';
import { exportAttachmentGlb } from '../src/gun/attachmentExport.ts';
import { attachmentMassKg } from '../src/gun/attachmentMass.ts';
import {
  ATTACHMENT_IDS,
  type AttachmentMetadata,
  type AttachmentSlotMetadata,
  attachmentMetadata,
  attachmentSlots,
} from '../src/gun/attachments.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { eulerXyzDegrees, toFileAxes } from '../src/gun/exportFrame.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { MOUNT_STANDARDS, mountCanAccept } from '../src/gun/mounts.ts';
import { OPTIC_CATALOG, opticRailContactSolids } from '../src/gun/optics.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { readGlb } from './glbReader.ts';
import { loadCorpus } from './helpers.ts';

const pairFixture = (withInstalledDefault = false) => {
  const family: PartFamily = {
    name: 'fixture-pair-rails',
    params: {},
    build: () => ({
      family: 'fixture-pair-rails',
      ports: [
        {
          id: 'blocked-left',
          mount: 'rail-bottom',
          gender: 'female',
          pos: [0, 0, 0],
          normal: [0, -1, 0],
          up: [1, 0, 0],
        },
        {
          id: 'blocked-right',
          mount: 'rail-bottom',
          gender: 'female',
          pos: [0, 0, 0],
          normal: [0, -1, 0],
          up: [1, 0, 0],
        },
        {
          id: 'clear',
          mount: 'rail-bottom',
          gender: 'female',
          pos: [0, 0, 100],
          normal: [0, -1, 0],
          up: [1, 0, 0],
        },
      ],
      solids: [],
      keepOuts: [],
      axes: [],
    }),
  };
  const domain: Domain = {
    ...gunDomain,
    families: { ...gunDomain.families, [family.name]: family },
  };
  const assembly: Assembly = {
    name: 'pair-certificate-fixture',
    root: 'mounts',
    parts: {
      mounts: { family: family.name, params: {} },
      ...(withInstalledDefault ? { installed: { family: 'foregrip', params: {} } } : {}),
    },
    connections: withInstalledDefault ? [{ from: 'mounts.clear', to: 'installed.base' }] : [],
  };
  const slots = attachmentSlots(resolve(assembly, domain));
  const compatibility = attachmentCompatibility(assembly, slots, domain);
  const pairs = attachmentCompatibilityPairs(assembly, slots, compatibility, domain);
  return { assembly, domain, slots, compatibility, pairs };
};

const sightlinePairFixture = () => {
  const receiver: PartFamily = {
    name: 'receiver',
    params: {},
    build: () => ({
      family: 'receiver',
      ports: [
        {
          id: 'rail',
          mount: 'rail-top',
          gender: 'female',
          pos: [0, 0, 0],
          normal: [0, 1, 0],
          up: [1, 0, 0],
          slots: { count: 31, pitch: 2 },
        },
      ],
      solids: [{ id: 'receiver-fixture-body', kind: 'box', box: { center: [27, -2, 0], half: [43, 2, 3] } }],
      keepOuts: [],
      axes: [],
    }),
  };
  const domain: Domain = { ...gunDomain, families: { ...gunDomain.families, receiver } };
  const assembly: Assembly = {
    name: 'optic-sightline-pair-fixture',
    root: 'receiver',
    parts: { receiver: { family: receiver.name, params: {} } },
    connections: [],
  };
  const slots = attachmentSlots(resolve(assembly, domain));
  const compatibility = attachmentCompatibility(assembly, slots, domain);
  const topRailSlots = slots.filter(({ mount }) => mount === 'rail-top');
  const slotAtNotch = (notch: number) => topRailSlots.find((slot) => slot.notchIndex === notch);
  const closeFirst = slotAtNotch(2);
  const closeSecond = slotAtNotch(12);
  const clearSecond = slotAtNotch(27);
  if (!(closeFirst && closeSecond && clearSecond)) {
    throw new Error('Sightline fixture did not expose its near and far notches');
  }
  const nearOpticId = 'optic-mini-reflex';
  const farOpticId = 'optic-digital-thermal';
  const singles: Readonly<Record<string, readonly string[]>> = {
    [closeFirst.id]: compatibility[closeFirst.id]?.filter((id) => id === nearOpticId) ?? [],
    [closeSecond.id]: compatibility[closeSecond.id]?.filter((id) => id === farOpticId) ?? [],
    [clearSecond.id]: compatibility[clearSecond.id]?.filter((id) => id === farOpticId) ?? [],
  };
  const certifiedChoices = [
    singles[closeFirst.id]?.includes(nearOpticId),
    singles[closeSecond.id]?.includes(farOpticId),
    singles[clearSecond.id]?.includes(farOpticId),
  ];
  if (certifiedChoices.some((certified) => !certified)) {
    throw new Error(`Sightline fixture does not certify each optic single: ${JSON.stringify(singles)}`);
  }
  const pairs = attachmentCompatibilityPairs(assembly, slots, singles, domain);
  const pairAssembly = (firstSlot: AttachmentSlotMetadata, secondSlot: AttachmentSlotMetadata): Assembly => ({
    ...assembly,
    parts: {
      ...assembly.parts,
      opticNear: { family: 'sight', params: { type: 'mini-reflex' } },
      opticFar: { family: 'sight', params: { type: 'digital-thermal' } },
    },
    connections: [
      {
        from: 'receiver.rail',
        to: 'opticNear.base',
        ...(firstSlot.notchIndex === undefined ? {} : { slot: firstSlot.notchIndex }),
      },
      {
        from: 'receiver.rail',
        to: 'opticFar.base',
        ...(secondSlot.notchIndex === undefined ? {} : { slot: secondSlot.notchIndex }),
      },
    ],
  });
  const closeResolved = resolve(pairAssembly(closeFirst, closeSecond), domain);
  const clearResolved = resolve(pairAssembly(closeFirst, clearSecond), domain);
  const closeKeepOutIssues = keepOutBetweenParts(closeResolved, 'opticNear', 'opticFar');
  return {
    closePair: orderedPair([closeFirst.id, nearOpticId], [closeSecond.id, farOpticId]),
    clearPair: orderedPair([closeFirst.id, nearOpticId], [clearSecond.id, farOpticId]),
    pairs,
    closeSolidIssues: solidOverlapBetweenParts(closeResolved, 'opticNear', 'opticFar'),
    closeKeepOutIssues,
    clearKeepOutIssues: keepOutBetweenParts(clearResolved, 'opticNear', 'opticFar'),
  };
};

const singleObstructionFixture = (obstructionKind: 'solid' | 'keep-out') => {
  const params = {
    action: 'auto',
    feed: 'box',
    section: 'ar',
    bore: 'M',
    rail: 'full',
    chargingHandle: 'side',
    boltHandle: 'rest',
    carrierPattern: 'auto',
    handleStyle: 'auto',
    boltHandleProfile: 'standard',
    magazineWell: 'standard',
  };
  const receiverFamily = FAMILIES.receiver;
  if (!receiverFamily) {
    throw new Error('Receiver family is missing');
  }
  const originalReceiver = receiverFamily.build(params);
  const rail = originalReceiver.ports.find(({ id }) => id === 'rail');
  if (!(rail?.slots && rail.mount === 'rail-top')) {
    throw new Error('Fixture receiver has no top rail');
  }
  const blockedIndex = 2;
  const clearIndex = 5;
  const blockedX = rail.pos[0] + rail.up[0] * blockedIndex * rail.slots.pitch;
  const obstructedReceiver: PartFamily = {
    ...receiverFamily,
    build: (fixtureParams) => {
      const receiver = receiverFamily.build(fixtureParams);
      const obstructionBox = {
        center: [blockedX, rail.pos[1] + 1.5, 0] as const,
        half: [2, 1.5, 2] as const,
      };
      return obstructionKind === 'solid'
        ? {
            ...receiver,
            solids: [...receiver.solids, { id: 'fixture-optic-obstruction', kind: 'box', box: obstructionBox }],
          }
        : {
            ...receiver,
            keepOuts: [
              ...receiver.keepOuts,
              { id: 'fixture-optic-obstruction', kind: 'fixture obstruction', box: obstructionBox },
            ],
          };
    },
  };
  const fixtureDomain: Domain = {
    ...gunDomain,
    families: { ...gunDomain.families, receiver: obstructedReceiver },
  };
  const assembly: Assembly = {
    name: `attachment-compatibility-${obstructionKind}-obstruction-fixture`,
    root: 'receiver',
    parts: { receiver: { family: 'receiver', params } },
    connections: [],
  };
  const slots = attachmentSlots(resolve(assembly, fixtureDomain));
  const compatibility = attachmentCompatibility(assembly, slots, fixtureDomain);
  return { rail, blockedIndex, clearIndex, slots, compatibility };
};

const compareText = (a: string, b: string): number => {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
};
const compareChoices = (a: readonly [string, string], b: readonly [string, string]): number =>
  compareText(a[0], b[0]) || compareText(a[1], b[1]);
const orderedPair = (a: readonly [string, string], b: readonly [string, string]) =>
  compareChoices(a, b) <= 0 ? [a, b] : [b, a];

const design = (name: string): Assembly => {
  const text = readFileSync(join(import.meta.dirname, '..', 'designs', `${name}.json`), 'utf8');
  const loaded = loadGunDesign(text);
  if (!loaded.ok) {
    throw new Error(`${name}: ${loaded.error.message}`);
  }
  return loaded.design.assembly;
};

const exported = (assembly: Assembly, id: string, includeCompatibility = true) => {
  const result = exportGunGlb(
    assembly,
    { id, file: `assets/models/${id}.glb` },
    {},
    {
      includeAttachmentCompatibility: includeCompatibility,
    },
  );
  if (!result.ok) {
    throw new Error(`${id}: ${JSON.stringify(result.error)}`);
  }
  return { ...result, read: readGlb(result.glb) };
};

const validateInDeadvox = (model: unknown) =>
  buildRegistry([{ source: 'gungen-attachment-test', data: { models: [model] } }]);

const hasExpectedRailSpan = (attachment: AttachmentMetadata): boolean =>
  attachment.mount === 'muzzle'
    ? attachment.properties.railSpanNotches === undefined
    : attachment.properties.railSpanNotches !== undefined;

const suppressorPropertiesMissing = (attachment: AttachmentMetadata): boolean => {
  const { noiseFactor, wearClass } = attachment.properties;
  return noiseFactor === undefined || noiseFactor <= 0 || noiseFactor >= 1 || !wearClass;
};

const attachmentMetadataProblems = (id: string, attachment: AttachmentMetadata | undefined): string[] => {
  if (!attachment) {
    return [`${id} has no attachment metadata`];
  }
  const problems: string[] = [];
  if (attachment.id !== id) {
    problems.push('attachment ID differs');
  }
  if (!attachment.mountFrame) {
    problems.push('exported mount connector frame is missing');
  }
  if (id.startsWith('optic-') && (!attachment.properties.reticleKind || attachment.sight?.kind !== 'optic')) {
    problems.push('optic reticle or sight frame is missing');
  }
  if (!hasExpectedRailSpan(attachment)) {
    problems.push('rail notch span does not match attachment mount');
  }
  if (id === 'rail-front-sight' && attachment.sight?.kind !== 'iron') {
    problems.push('iron sight frame is missing');
  }
  if (attachment.kind === 'suppressor' && suppressorPropertiesMissing(attachment)) {
    problems.push('suppressor gameplay properties are missing');
  }
  if (attachment.kind === 'flashlight-mount' && attachment.mount !== 'rail-side') {
    problems.push('flashlight mount does not use the side rail');
  }
  if (attachment.kind === 'foregrip' && !attachment.properties.handlingClass) {
    problems.push('foregrip handling property is missing');
  }
  return problems;
};

const attachmentFamily = (id: string): string => {
  if (id.startsWith('optic-')) {
    return 'sight';
  }
  if (id === 'real-suppressor' || id === 'improvised-suppressor') {
    return 'suppressor';
  }
  return id;
};

const fittedMountPose = ({
  label,
  assembly,
  resolved,
  fitted,
  slots,
}: {
  readonly label: string;
  readonly assembly: Assembly;
  readonly resolved: ReturnType<typeof resolve>;
  readonly fitted: { readonly id: string; readonly node: string; readonly mountedAt: string; readonly mount: string };
  readonly slots: readonly { readonly id: string; readonly position: readonly number[] }[];
}) => {
  const slot = slots.find(({ id }) => id === fitted.mountedAt);
  const partId = Object.entries(assembly.parts).find(
    ([id, part]) => partNodeName(id, part.family) === fitted.node,
  )?.[0];
  if (!(slot && partId)) {
    throw new Error(`${label}: ${fitted.id} has no exported mount slot or source part`);
  }
  const definition = resolved.defs.get(partId);
  const transform = resolved.placed.get(partId);
  const port = definition?.ports.find(({ gender, mount }) => gender === 'male' && mount === fitted.mount);
  if (!(transform && port)) {
    throw new Error(`${label}: ${fitted.id} has no placed male mount port`);
  }
  const position = toFileAxes(applyPoint(transform, port.pos)).map((value) => {
    const rounded = Math.round(value * gunDomain.units.metresPerUnit * 1e6) / 1e6;
    return rounded === 0 ? 0 : rounded;
  });
  return { actual: slot.position, expected: position, context: `${label}: ${fitted.id} mount pose` };
};

const attachmentBuild = (id: string) => {
  const familyName = attachmentFamily(id);
  const family = gunDomain.families[familyName];
  if (!family) {
    throw new Error(`${id} has no part family`);
  }
  const defaults = Object.fromEntries(
    Object.entries(family.params).flatMap(([name, spec]) => (spec.default === undefined ? [] : [[name, spec.default]])),
  );
  const params = {
    ...defaults,
    ...(familyName === 'sight' ? { type: id.slice('optic-'.length) } : {}),
    ...(familyName === 'suppressor' ? { type: id } : {}),
  };
  return { familyName, params, part: family.build(params) };
};

const railExtent = (part: PartDef, port: PortDef, pitch: number, solids = part.solids) => {
  const offsets: number[] = [];
  for (const solid of solids) {
    const [low, high] = localSolidBounds(solid);
    for (const x of [low[0], high[0]]) {
      for (const y of [low[1], high[1]]) {
        for (const z of [low[2], high[2]]) {
          offsets.push(
            ((x - port.pos[0]) * port.up[0] + (y - port.pos[1]) * port.up[1] + (z - port.pos[2]) * port.up[2]) / pitch,
          );
        }
      }
    }
  }
  return { min: Math.min(...offsets), max: Math.max(...offsets) };
};

const railSpanExtent = (id: string) => {
  const { familyName, params, part } = attachmentBuild(id);
  const metadata = attachmentMetadata(familyName, params, gunDomain.units.metresPerUnit, part);
  if (!metadata) {
    throw new Error(`${id} has no attachment metadata`);
  }
  if (metadata.mount === 'muzzle') {
    return;
  }
  const span = metadata.properties.railSpanNotches;
  const port = part.ports.find(({ gender, mount }) => gender === 'male' && mount === metadata.mount);
  const pitch = MOUNT_STANDARDS[metadata.mount].slotPitchU;
  if (!(span && port && pitch !== undefined)) {
    throw new Error(`${id} has no rail span, male mount port, or notch pitch`);
  }
  const contactSolids = familyName === 'sight' ? opticRailContactSolids(part.solids) : part.solids;
  return {
    id,
    span,
    extent: railExtent(part, port, pitch, contactSolids),
    ...(familyName === 'sight' ? { bodyExtent: railExtent(part, port, pitch) } : {}),
  };
};

describe('attachment parts and export metadata', () => {
  it('makes the improvised suppressor longer and wider than the real one', () => {
    const extent = (id: string) => {
      const { part } = attachmentBuild(id);
      const [low, high] = localSolidBounds(part.solids[0]!);
      return {
        length: high[0] - low[0],
        radius: Math.max(Math.abs(low[1]), Math.abs(high[1]), Math.abs(low[2]), Math.abs(high[2])),
      };
    };
    const real = extent('real-suppressor');
    const improvised = extent('improvised-suppressor');
    expect(improvised.length).toBeGreaterThan(real.length);
    expect(improvised.radius).toBeGreaterThan(real.radius);
    const suppressorMass = (id: string) => {
      const { familyName, params, part } = attachmentBuild(id);
      return attachmentMetadata(familyName, params, gunDomain.units.metresPerUnit, part)!.massKg;
    };
    expect(suppressorMass('improvised-suppressor')).toBeGreaterThan(suppressorMass('real-suppressor'));
  });

  it('uses material density as a mass relation for identical geometry', () => {
    const { part } = attachmentBuild('foregrip');
    const aluminium = attachmentMassKg(
      'foregrip',
      { ...part, material: 'alu-anodized-black' },
      gunDomain.units.metresPerUnit,
    );
    const steel = attachmentMassKg(
      'foregrip',
      { ...part, material: 'steel-parkerized' },
      gunDomain.units.metresPerUnit,
    );
    expect(steel).toBeGreaterThan(aluminium);
  });

  it('exports each attachment as standalone glTF and metadata deadvox accepts', async () => {
    const models = await Promise.all(
      ATTACHMENT_IDS.map(async (id) => {
        const modelId = id.replaceAll('-', '_');
        const result = exportAttachmentGlb(id, { id: modelId, file: `assets/models/${modelId}.glb` });
        if (!result.ok) {
          throw new Error(`${id}: ${JSON.stringify(result.error)}`);
        }
        return {
          id,
          modelId,
          result,
          deadvox: validateInDeadvox(result.modelEntry),
          gltf: await validator.validateBytes(result.glb, { uri: `${modelId}.glb` }),
          nodes: readGlb(result.glb).json.nodes.map(({ name }) => name),
        };
      }),
    );
    for (const { id, modelId, result, deadvox, gltf, nodes } of models) {
      expect(deadvox.issues).toEqual([]);
      expect(deadvox.registry.models.has(modelId)).toBe(true);
      expect(attachmentMetadataProblems(id, result.modelEntry.attachment)).toEqual([]);
      const { familyName, params, part } = attachmentBuild(id);
      const metadata = attachmentMetadata(familyName, params, gunDomain.units.metresPerUnit, part)!;
      const port = part.ports.find(({ gender, mount }) => gender === 'male' && mount === metadata.mount);
      expect(metadata.mountFrame).toEqual(port && { normal: port.normal, up: port.up });
      expect(gltf.issues.numErrors).toBe(0);
      expect(gltf.issues.numWarnings).toBe(0);
      expect(nodes).toContain(partNodeName(id, attachmentFamily(id)));
    }
  });

  it('exports cataloged magnification metadata on a standalone optic', () => {
    const [opticId, optic] = Object.entries(OPTIC_CATALOG).find(([, value]) => value.magnification) ?? [];
    if (!(opticId && optic?.magnification)) {
      throw new Error('The optic catalog has no magnified optic');
    }
    const result = exportAttachmentGlb(`optic-${opticId}`, {
      id: `optic_${opticId}`,
      file: `assets/models/optic_${opticId}.glb`,
    });
    if (!result.ok) {
      throw new Error(`${opticId}: ${JSON.stringify(result.error)}`);
    }
    expect(result.modelEntry.attachment?.properties.magnification).toEqual(optic.magnification);
  });

  describe('AR default-mods export', () => {
    let defaultModsModel: ReturnType<typeof exported>;

    // Builds and exports the AR design with default attachment compatibility metadata.
    beforeAll(() => {
      defaultModsModel = exported(design('archetype-ar'), 'ar_default_mods');
    }, 10_000);

    it('exports fitted default mods as node-backed metadata linked to mount slots', () => {
      const model = defaultModsModel;
      const nodes = model.read.json.nodes.map(({ name }) => name);
      const fitted = model.modelEntry.attachments ?? [];
      const slots = model.modelEntry.attachmentSlots ?? [];
      expect(fitted.some(({ kind, node }) => kind === 'optic' && nodes.includes(node))).toBe(true);
      expect(
        fitted.every(({ mountedAt, mount }) => slots.some((slot) => slot.id === mountedAt && slot.mount === mount)),
      ).toBe(true);
      expect(validateInDeadvox(model.modelEntry).issues).toEqual([]);
      const { compatibility } = model.modelEntry;
      if (!compatibility) {
        throw new Error('gungen did not export attachment compatibility');
      }
      expect(Object.keys(compatibility).sort()).toEqual(slots.map(({ id }) => id).sort());
      expect(model.modelEntry.compatibilityPairs).toBeDefined();
      for (const ids of Object.values(compatibility)) {
        for (const id of ids) {
          expect(ATTACHMENT_IDS).toContain(id);
        }
      }
    });

    it('matches fitted optic mass to the standalone attachment export', () => {
      const fittedOptic = defaultModsModel.modelEntry.attachments?.find(({ id }) => id === 'optic-lpvo-1-6x');
      expect(fittedOptic?.massKg).toBeDefined();
      const standalone = exportAttachmentGlb('optic-lpvo-1-6x', {
        id: 'optic_lpvo_mass_comparison',
        file: 'assets/models/optic_lpvo_mass_comparison.glb',
      });
      if (!standalone.ok) {
        throw new Error(JSON.stringify(standalone.error));
      }
      expect(fittedOptic?.massKg).toBe(standalone.modelEntry.attachment?.massKg);
    });
  });

  it('rejects a candidate at a solid-obstructed slot while certifying the same mount at a clear slot', () => {
    const { rail, blockedIndex, clearIndex, slots, compatibility } = singleObstructionFixture('solid');
    const blocked = slots.find(({ notchIndex }) => notchIndex === blockedIndex);
    const clear = slots.find(({ notchIndex }) => notchIndex === clearIndex);
    const optic = OPTIC_CATALOG['mini-reflex'];
    if (!(blocked && clear && optic)) {
      throw new Error('Fixture did not produce both optic slots');
    }
    expect(mountCanAccept(rail, optic.mount, blockedIndex)).toBe(true);
    expect(mountCanAccept(rail, optic.mount, clearIndex)).toBe(true);
    expect(compatibility[blocked.id]).not.toContain('optic-mini-reflex');
    expect(compatibility[clear.id]).toContain('optic-mini-reflex');
  });

  it('rejects a candidate in a keep-out at one slot while certifying it at a clear slot', () => {
    const { rail, blockedIndex, clearIndex, slots, compatibility } = singleObstructionFixture('keep-out');
    const blocked = slots.find(({ notchIndex }) => notchIndex === blockedIndex);
    const clear = slots.find(({ notchIndex }) => notchIndex === clearIndex);
    const optic = OPTIC_CATALOG['mini-reflex'];
    if (!(blocked && clear && optic)) {
      throw new Error('Fixture did not produce both optic slots');
    }
    expect(mountCanAccept(rail, optic.mount, blockedIndex)).toBe(true);
    expect(mountCanAccept(rail, optic.mount, clearIndex)).toBe(true);
    expect(compatibility[blocked.id]).not.toContain('optic-mini-reflex');
    expect(compatibility[clear.id]).toContain('optic-mini-reflex');
  });

  it('certifies clear attachment pairs and rejects a pair that overlaps on fixture geometry', () => {
    const { slots, compatibility, pairs } = pairFixture();
    const blockedLeft = slots.find(({ id }) => id === 'mounts.blocked-left.0');
    const blockedRight = slots.find(({ id }) => id === 'mounts.blocked-right.0');
    const clear = slots.find(({ id }) => id === 'mounts.clear.0');
    if (!(blockedLeft && blockedRight && clear)) {
      throw new Error('Pair fixture did not expose all mount slots');
    }
    const sharedId = compatibility[blockedLeft.id]?.find((id) => compatibility[blockedRight.id]?.includes(id));
    if (!sharedId) {
      throw new Error('Fixture has no attachment certified at both co-located slots');
    }
    const blockedPair = orderedPair([blockedLeft.id, sharedId], [blockedRight.id, sharedId]);
    const clearPair = orderedPair([blockedLeft.id, sharedId], [clear.id, sharedId]);
    expect(compatibility[blockedLeft.id]).toContain(sharedId);
    expect(compatibility[blockedRight.id]).toContain(sharedId);
    expect(pairs).not.toContainEqual(blockedPair);
    expect(pairs).toContainEqual(clearPair);
  });

  it('rejects an optic pair whose sightline keep-out contains its partner without solid overlap', () => {
    const { closePair, clearPair, pairs, closeSolidIssues, closeKeepOutIssues, clearKeepOutIssues } =
      sightlinePairFixture();
    expect(closeSolidIssues).toEqual([]);
    expect(closeKeepOutIssues.length).toBeGreaterThan(0);
    expect(clearKeepOutIssues).toEqual([]);
    expect(pairs).not.toContainEqual(closePair);
    expect(pairs).toContainEqual(clearPair);
  });

  it('certifies a dynamic single beside an installed default', () => {
    const { assembly, domain, slots, compatibility } = pairFixture(true);
    const blocked = slots.find(({ id }) => id === 'mounts.blocked-left.0');
    const installed = slots.find(({ id }) => id === 'mounts.clear.0');
    const blockedChoices = blocked ? compatibility[blocked.id] : undefined;
    if (!(blocked && installed && blockedChoices?.includes('foregrip'))) {
      throw new Error('Pair fixture did not expose a dynamic fit beside its default');
    }
    const onlyDynamicSlot = { [blocked.id]: blockedChoices };
    const pairs = attachmentCompatibilityPairs(assembly, slots, onlyDynamicSlot, domain);
    expect(pairs).toContainEqual(orderedPair([blocked.id, 'foregrip'], [installed.id, 'foregrip']));
  });

  it('serializes the complete pair list canonically regardless of slot input order', () => {
    const { assembly, domain, slots, compatibility, pairs } = pairFixture();
    const reversedCompatibility = Object.fromEntries(Object.entries(compatibility).reverse());
    const reversed = attachmentCompatibilityPairs(assembly, [...slots].reverse(), reversedCompatibility, domain);
    const comparePairs = (a: (typeof pairs)[number], b: (typeof pairs)[number]): number =>
      compareChoices(a[0], b[0]) || compareChoices(a[1], b[1]);
    expect(reversed).toEqual(pairs);
    expect(pairs).toEqual([...pairs].sort(comparePairs));
    expect(pairs.every(([first, second]) => compareChoices(first, second) <= 0)).toBe(true);
    expect(new Set(pairs.map((pair) => JSON.stringify(pair))).size).toBe(pairs.length);
  });

  it('rejects a fitted mod whose mount slot is absent from the exported interfaces', () => {
    const model = exported(design('archetype-ar'), 'ar_default_mods');
    const fitted = model.modelEntry.attachments?.[0];
    if (!fitted) {
      throw new Error('archetype-ar has no fitted default mods');
    }
    const invalid = {
      ...model.modelEntry,
      attachmentSlots: model.modelEntry.attachmentSlots?.filter(({ id }) => id !== fitted.mountedAt),
    };
    expect(validateInDeadvox(invalid).issues.length).toBeGreaterThan(0);
  });

  it('tracks a fitted rail sight to its removable mount slot', () => {
    const model = exported(design('archetype-ar-free-float'), 'ar_free_float');
    const fittedSight = model.modelEntry.attachments?.find(({ kind }) => kind === 'iron-sight');
    expect(fittedSight?.node).toBeTruthy();
    expect(
      model.modelEntry.attachmentSlots?.some(
        ({ id, mount }) => id === fittedSight?.mountedAt && mount === fittedSight.mount,
      ),
    ).toBe(true);
  });

  it('rejects two fitted attachments whose rail notch spans overlap', () => {
    const model = exported(design('archetype-ar'), 'ar_overlap');
    const fitted = model.modelEntry.attachments?.find(({ mount }) => mount !== 'muzzle');
    const anchor = model.modelEntry.attachmentSlots?.find(({ id }) => id === fitted?.mountedAt);
    const span = fitted?.properties.railSpanNotches;
    if (!(fitted && anchor?.railId && anchor.notchIndex !== undefined && span)) {
      throw new Error('AR default optic has no rail span');
    }
    const min = anchor.notchIndex + span.minOffset;
    const max = anchor.notchIndex + span.maxOffset;
    const conflict = model.modelEntry.attachmentSlots?.find(
      ({ id, railId, notchIndex }) =>
        id !== anchor.id &&
        railId === anchor.railId &&
        notchIndex !== undefined &&
        notchIndex + span.minOffset <= max &&
        notchIndex + span.maxOffset >= min,
    );
    if (!conflict) {
      throw new Error('AR optic span covers no other rail notch');
    }
    const invalid = {
      ...model.modelEntry,
      attachments: [
        ...(model.modelEntry.attachments ?? []),
        { ...fitted, id: 'overlapping-attachment', node: 'overlapping_node', mountedAt: conflict.id },
      ],
    };
    expect(validateInDeadvox(invalid).issues.map(({ message }) => message)).toContain(
      'fitted attachments need unique matching mount slots and non-overlapping rail spans',
    );
  });

  it("does not export a fitted suppressor's female tip as a mount slot", () => {
    const ar = design('archetype-ar');
    const assembly: Assembly = {
      ...ar,
      parts: { ...ar.parts, suppressor: { family: 'suppressor', params: { type: 'real-suppressor' } } },
      connections: [...ar.connections, { from: 'barrel.muzzle', to: 'suppressor.base' }],
    };
    const model = exported(assembly, 'ar_suppressor');
    expect(model.modelEntry.attachmentSlots?.some(({ id }) => id.startsWith('suppressor.'))).toBe(false);
    expect(
      model.modelEntry.attachments?.some(
        ({ id, mountedAt }) => id === 'real-suppressor' && mountedAt === 'barrel.muzzle.0',
      ),
    ).toBe(true);
  });

  it('finds an attachment host from its male mount port when another connection touches its female tip first', () => {
    const ar = design('archetype-ar');
    const assembly: Assembly = {
      ...ar,
      parts: {
        ...ar.parts,
        suppressor: { family: 'suppressor', params: { type: 'real-suppressor' } },
        tipDevice: { family: 'suppressor', params: { type: 'improvised-suppressor' } },
      },
      connections: [
        { from: 'suppressor.muzzle', to: 'tipDevice.base' },
        { from: 'barrel.muzzle', to: 'suppressor.base' },
        ...ar.connections,
      ],
    };
    const result = exportGunGlb(assembly, { id: 'ar_tip_device', file: 'assets/models/ar_tip_device.glb' }, {});
    if (!result.ok) {
      throw new Error(JSON.stringify(result.error));
    }
    const suppressor = result.modelEntry.attachments?.find(({ id }) => id === 'real-suppressor');
    expect(suppressor?.mountedAt).toBe('barrel.muzzle.0');
  });

  it('exports the fitted magazine node and replacement transform as the item-owned slot', () => {
    for (const name of ['archetype-ar', 'archetype-ak-akm']) {
      const assembly = design(name);
      const model = exported(assembly, name.replaceAll('-', '_'));
      const slot = model.modelEntry.slots?.magazine;
      if (!slot) {
        throw new Error(`${name} did not export its magazine slot`);
      }
      const deadvox = validateInDeadvox(model.modelEntry);
      expect(deadvox.issues, name).toEqual([]);
      expect(deadvox.registry.models.has(model.modelEntry.id)).toBe(true);
      const node = model.read.json.nodes.find(({ name: nodeName }) => nodeName === slot.node);
      expect(node).toBeDefined();
      for (const [axis, value] of slot.at.entries()) {
        expect(value).toBeCloseTo(node?.translation?.[axis] ?? Number.NaN, 6);
      }
      const transform = resolve(assembly, gunDomain).placed.get('magazine');
      if (!transform) {
        throw new Error(`${name} has no placed magazine`);
      }
      expect(slot.turn).toEqual(eulerXyzDegrees(transform.r));
      expect(slot.node).toBe(partNodeName('magazine', 'magazine'));
      expect(model.modelEntry.anchors?.magwell).toBeUndefined();
    }
  });

  it('generates an AK magazine whose calibre matches each template selection', () => {
    const template = TEMPLATES.find(({ name }) => name === 'ak');
    if (!template) {
      throw new Error('AK template is missing');
    }
    for (const [calibre, expectedVariant] of Object.entries(AK_MAGAZINE_VARIANT_BY_CALIBRE)) {
      const generated = generateValid({ ...template, variant: calibre }, gunDomain, 0);
      expect(generated).toBeDefined();
      const variant = generated?.assembly.parts.magazine?.params?.variant as
        | keyof typeof AK_MAGAZINE_CALIBRE_BY_VARIANT
        | undefined;
      expect(variant).toBe(expectedVariant);
      expect(variant && AK_MAGAZINE_CALIBRE_BY_VARIANT[variant]).toBe(calibre);
    }
  });

  const corpus = loadCorpus();

  it('has design and fixture entries to verify', () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it.each(corpus)('exports mount poses for $label', ({ label, assembly }) => {
    const model = exported(assembly, `corpus_${assembly.name.replaceAll('-', '_')}`, false);
    const slots = model.modelEntry.attachmentSlots ?? [];
    const fitted = model.modelEntry.attachments ?? [];
    expect(
      fitted.every(({ mountedAt, mount }) => slots.some((slot) => slot.id === mountedAt && slot.mount === mount)),
      label,
    ).toBe(true);
    const deadvox = validateInDeadvox(model.modelEntry);
    expect(deadvox.issues, label).toEqual([]);
    expect(deadvox.registry.models.has(model.modelEntry.id), label).toBe(true);
    const resolved = resolve(assembly, gunDomain);
    for (const fittedAttachment of fitted) {
      const { actual, expected, context } = fittedMountPose({
        label,
        assembly,
        resolved,
        fitted: fittedAttachment,
        slots,
      });
      expect(actual, context).toEqual(expected);
    }
    const expectedPorts = attachmentSlots(resolved);
    expect(slots).toHaveLength(expectedPorts.length);
    for (const expected of expectedPorts) {
      expect(
        slots.some((slot) => slot.id === expected.id),
        `${label}: ${expected.id}`,
      ).toBe(true);
      if (expected.mount === 'muzzle') {
        expect(slots.find(({ id }) => id === expected.id)).not.toHaveProperty('railId');
      } else {
        expect(slots.find(({ id }) => id === expected.id)).toMatchObject({
          railId: expected.railId,
          notchIndex: expected.notchIndex,
        });
      }
    }
  });

  it('exports rail spans from attachment contacts rather than optic-body envelopes', () => {
    const spans = ATTACHMENT_IDS.flatMap((id) => {
      const span = railSpanExtent(id);
      return span ? [span] : [];
    });
    expect(spans.length).toBeGreaterThan(0);
    expect(
      spans.some(
        ({ span, bodyExtent }) =>
          bodyExtent && (bodyExtent.min < span.minOffset - 0.5 - 1e-9 || bodyExtent.max > span.maxOffset + 0.5 + 1e-9),
      ),
    ).toBe(true);
    for (const { id, span, extent } of spans) {
      expect(extent.min, `${id}: lower rail-cell edge`).toBeGreaterThanOrEqual(span.minOffset - 0.5 - 1e-9);
      expect(extent.max, `${id}: upper rail-cell edge`).toBeLessThanOrEqual(span.maxOffset + 0.5 + 1e-9);
      expect(span.minOffset, `${id}: lowest intersected cell`).toBe(Math.floor(extent.min + 0.5));
      expect(span.maxOffset, `${id}: highest intersected cell`).toBe(Math.ceil(extent.max + 0.5) - 1);
    }
  });

  it('rejects an attachment on the wrong mount through port-compat', () => {
    const ar = design('archetype-ar');
    const wrongMount = 'wrong-mount';
    const invalid: Assembly = {
      ...ar,
      parts: {
        ...ar.parts,
        [wrongMount]: { family: 'tactical-flashlight-mount' },
      },
      connections: [...ar.connections, { from: 'barrel.muzzle', to: `${wrongMount}.base` }],
    };
    const report = validate(invalid, gunDomain).issues;
    expect(report.some(({ rule }) => rule === 'port-compat')).toBe(true);
  });
});
