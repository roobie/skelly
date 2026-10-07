import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import validator from 'gltf-validator';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../../deadvox/src/core/content.ts';
import { generateValid } from '../src/core/generate.ts';
import { partNodeName } from '../src/core/glb.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { exportAttachmentGlb } from '../src/gun/attachmentExport.ts';
import { ATTACHMENT_IDS, type AttachmentMetadata, attachmentSlots } from '../src/gun/attachments.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { eulerXyzDegrees } from '../src/gun/exportFrame.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { OPTIC_CATALOG } from '../src/gun/optics.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { readGlb } from './glbReader.ts';

const design = (name: string): Assembly => {
  const text = readFileSync(join(import.meta.dirname, '..', 'designs', `${name}.json`), 'utf8');
  const loaded = loadGunDesign(text);
  if (!loaded.ok) {
    throw new Error(`${name}: ${loaded.error.message}`);
  }
  return loaded.design.assembly;
};

const exported = (assembly: Assembly, id: string) => {
  const result = exportGunGlb(assembly, { id, file: `assets/models/${id}.glb` }, {});
  if (!result.ok) {
    throw new Error(`${id}: ${JSON.stringify(result.error)}`);
  }
  return { ...result, read: readGlb(result.glb) };
};

const validateInDeadvox = (model: unknown) =>
  buildRegistry([{ source: 'gungen-attachment-test', data: { models: [model] } }]);

const attachmentMetadataProblems = (id: string, attachment: AttachmentMetadata | undefined): string[] => {
  if (!attachment) {
    return [`${id} has no attachment metadata`];
  }
  const problems: string[] = [];
  if (attachment.id !== id) {
    problems.push('attachment ID differs');
  }
  if (id.startsWith('optic-') && (!attachment.properties.reticleKind || attachment.sight?.kind !== 'optic')) {
    problems.push('optic reticle or sight frame is missing');
  }
  if (id === 'rail-front-sight' && attachment.sight?.kind !== 'iron') {
    problems.push('iron sight frame is missing');
  }
  const { noiseFactor, wearClass } = attachment.properties;
  if (
    attachment.kind === 'suppressor' &&
    (noiseFactor === undefined || noiseFactor <= 0 || noiseFactor >= 1 || !wearClass)
  ) {
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

describe('attachment parts and export metadata', () => {
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

  it('exports fitted default mods as node-backed metadata linked to mount slots', () => {
    const model = exported(design('archetype-ar'), 'ar_default_mods');
    const nodes = model.read.json.nodes.map(({ name }) => name);
    const fitted = model.modelEntry.attachments ?? [];
    const slots = model.modelEntry.attachmentSlots ?? [];
    expect(fitted.some(({ kind, node }) => kind === 'optic' && nodes.includes(node))).toBe(true);
    expect(
      fitted.every(({ mountedAt, mount }) => slots.some((slot) => slot.id === mountedAt && slot.mount === mount)),
    ).toBe(true);
    expect(validateInDeadvox(model.modelEntry).issues).toEqual([]);
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

  it('selects the AKM magazine profile for the 7.62×39 AK design', () => {
    const akm = design('archetype-ak-akm');
    expect(akm.parts.magazine?.params?.variant).toBe('akm');
    expect(akm.parts.magazine?.params?.profile).toBe('ak-curved');
  });

  it('exports every mount pose, including open slots, on every firearm template', () => {
    for (const [index, template] of TEMPLATES.entries()) {
      const generated = generateValid(template, gunDomain, 73 + index);
      if (!generated) {
        throw new Error(`${template.name} has no valid fixture`);
      }
      const model = exported(generated.assembly, `template_${template.name.replaceAll('-', '_')}`);
      const slots = model.modelEntry.attachmentSlots ?? [];
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.some(({ id }) => !model.modelEntry.attachments?.some(({ mountedAt }) => mountedAt === id))).toBe(
        true,
      );
      expect(
        (model.modelEntry.attachments ?? []).every(({ mountedAt, mount }) =>
          slots.some((slot) => slot.id === mountedAt && slot.mount === mount),
        ),
        `${template.name}: ${JSON.stringify(model.modelEntry.attachments?.map(({ id, mountedAt, mount }) => ({ id, mountedAt, mount })))}`,
      ).toBe(true);
      const deadvox = validateInDeadvox(model.modelEntry);
      expect(deadvox.issues).toEqual([]);
      expect(deadvox.registry.models.has(model.modelEntry.id)).toBe(true);
      const expectedPorts = attachmentSlots(resolve(generated.assembly, gunDomain));
      expect(slots).toHaveLength(expectedPorts.length);
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
