import { describe, expect, it } from 'vitest';
import { generateValid, type Realized } from '../src/core/generate.ts';
import { posedVoxelSurfaceBounds, posedVoxelSurfaceBoundsForBones } from '../src/core/voxelBounds.ts';
import { crowdTextureLayout, isSeveredInMask, packSeveredMask } from '../src/mob/crowd.ts';
import { severedBoneSet } from '../src/mob/dismember.ts';
import { dogTemplate } from '../src/mob/dogTemplate.ts';
import {
  legBoneIds,
  QUADRUPED_LEGS,
  QUADRUPED_SEVERABLE_PARTS,
  QUADRUPED_SUPPORT_BONES,
  type QuadrupedLeg,
} from '../src/mob/quadruped.ts';
import {
  groundQuadrupedPose,
  quadrupedGaitPose,
  quadrupedHitPose,
  quadrupedPose,
  quadrupedStyle,
} from '../src/mob/quadrupedPose.ts';
import { HIT_FLINCH } from '../src/mob/reactions.ts';
import { HUMANOID_TEMPLATES, TEMPLATES } from '../src/mob/templates.ts';
import { VIEWER_TEMPLATES } from '../src/mob/viewerTemplates.ts';
import { sweepGroup } from './sweeps.ts';

/** The figure each seed's search finds, realized once — every test below reads properties off it. */
const figures = new Map<number, { realized: Realized; params: Readonly<Record<string, number>> }>();
const figureFor = (anchor: number) => {
  const cached = figures.get(anchor);
  if (cached) {
    return cached;
  }
  const found = generateValid(dogTemplate, anchor);
  if (!found) {
    throw new Error(`no valid dog within 100 seeds of ${anchor}`);
  }
  const figure = { realized: found.realized, params: found.genome.params };
  figures.set(anchor, figure);
  return figure;
};

/** The seeds each property is checked on by default; the sweeps group stretches the same properties
 * over more searches behind MOBGEN_SWEEPS/CI. */
const ANCHORS = [1, 2, 3];
const SWEEP_ANCHORS = Array.from({ length: 21 }, (_, index) => index + 4);

/** Paw surfaces within one voxel of the ground count as planted. */
const plantedPaws = (surfaces: ReadonlyMap<string, number>, voxel: number): number =>
  QUADRUPED_SUPPORT_BONES.filter((paw) => Math.abs(surfaces.get(paw) ?? Number.POSITIVE_INFINITY) <= voxel).length;

const gaitSupportProperties = (anchor: number): boolean[] => {
  const { realized, params } = figureFor(anchor);
  const voxel = realized.voxels.size;
  const properties: boolean[] = [];
  for (const speed of [0.5, 1]) {
    for (let step = 0; step < 16; step++) {
      const phase = (step / 16) * Math.PI * 2;
      const gait = quadrupedGaitPose(realized, phase, speed, quadrupedStyle(params));
      const surfaces = posedVoxelSurfaceBounds(realized, gait);
      // The body stays on its supports: never sunk, never lifted off, and at least two of the four
      // paws carry it at every phase (a limping walk that lifts three paws would fall over).
      properties.push(surfaces.lowest >= -voxel, surfaces.lowest <= voxel);
      properties.push(plantedPaws(surfaces.byBone, voxel) >= 2);
    }
  }
  return properties;
};

describe('quadruped', () => {
  it('is a viewer-only template, outside the spawnable lists', () => {
    expect(VIEWER_TEMPLATES.map((template) => template.name)).toContain(dogTemplate.name);
    expect(TEMPLATES.map((template) => template.name)).not.toContain(dogTemplate.name);
    expect(HUMANOID_TEMPLATES.map((template) => template.name)).not.toContain(dogTemplate.name);
    expect(dogTemplate.supportBones).toEqual(QUADRUPED_SUPPORT_BONES);
    expect(dogTemplate.supportBones).toHaveLength(QUADRUPED_LEGS.length);
  });

  it('has four legs of three bones each, from the chest and the pelvis', () => {
    const { realized } = figureFor(ANCHORS[0]!);
    const byId = new Map(realized.body.bones.map((bone) => [bone.id, bone]));
    for (const leg of QUADRUPED_LEGS) {
      const [upper, lower, paw] = legBoneIds(leg as QuadrupedLeg);
      const legBones = [upper, lower, paw].map((id) => byId.get(id));
      expect(legBones.map((bone) => bone?.id)).toEqual([upper, lower, paw]);
      expect(legBones[1]?.parent).toBe(upper);
      expect(legBones[2]?.parent).toBe(lower);
      expect(legBones[0]?.parent).toBe(leg[0] === 'F' ? 'chest' : 'pelvis');
    }
    // head and jaw exist, and each paw id is the distal bone of its own leg.
    expect(byId.get('head')).toBeDefined();
    expect(byId.get('jaw')?.parent).toBe('head');
    for (const paw of QUADRUPED_SUPPORT_BONES) {
      expect(byId.get(paw)).toBeDefined();
    }
  });

  it.each(ANCHORS)('all four paws ground the body and match the declared supports for search anchor %i', (anchor) => {
    const { realized } = figureFor(anchor);
    const [nx, ny] = realized.voxels.dims;
    let lowestRow = Number.POSITIVE_INFINITY;
    for (let index = 0; index < realized.voxels.owner.length; index++) {
      if (realized.voxels.owner[index] !== 0) {
        lowestRow = Math.min(lowestRow, Math.floor(index / nx) % ny);
      }
    }
    const contacts = new Set<string>();
    for (let index = 0; index < realized.voxels.owner.length; index++) {
      const owner = realized.voxels.owner[index]!;
      if (owner !== 0 && Math.floor(index / nx) % ny === lowestRow) {
        contacts.add(realized.body.bones[owner - 1]!.id);
      }
    }
    expect(realized.supportBones).toEqual(new Set(QUADRUPED_SUPPORT_BONES));
    expect(contacts).toEqual(new Set(QUADRUPED_SUPPORT_BONES));
    expect(realized.report.issues.filter((issue) => issue.rule === 'grounded')).toEqual([]);
    expect(realized.report.issues.filter((issue) => issue.rule === 'balance')).toEqual([]);

    // The standing pose rests the whole figure on those paws: every paw's own voxel surface sits
    // on the ground, and nothing else reaches it.
    const pose = quadrupedPose(realized);
    const voxel = realized.voxels.size;
    const surfaces = posedVoxelSurfaceBounds(realized, pose).byBone;
    for (const paw of QUADRUPED_SUPPORT_BONES) {
      expect(Math.abs(surfaces.get(paw) ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(voxel);
    }
    const nonSupportSurfaces = [...surfaces.entries()].filter(([bone]) => !QUADRUPED_SUPPORT_BONES.includes(bone));
    expect(nonSupportSurfaces.length).toBeGreaterThan(0);
    expect(Math.min(...nonSupportSurfaces.map(([, y]) => y))).toBeGreaterThan(voxel);
  });

  it.each(ANCHORS)('the gait keeps the body supported for search anchor %i', (anchor) => {
    const { realized, params } = figureFor(anchor);
    const properties = gaitSupportProperties(anchor);
    expect(properties.length).toBeGreaterThan(0);
    expect(properties.every(Boolean)).toBe(true);
    // A stopped animal stands, not mid-stride.
    expect(quadrupedGaitPose(realized, 1.2, 0, quadrupedStyle(params))).toEqual(quadrupedPose(realized));
    expect(quadrupedGaitPose(realized, 1.2, 0, quadrupedStyle(params))).toEqual(
      quadrupedGaitPose(realized, Number.NaN, 1, quadrupedStyle(params)),
    );
  });

  it.each(ANCHORS)('the hit pose re-grounds its recoil on the paw supports for search anchor %i', (anchor) => {
    const { realized, params } = figureFor(anchor);
    const voxel = realized.voxels.size;
    const base = quadrupedGaitPose(realized, 2.1, 1, quadrupedStyle(params));

    // No reaction at the clip's edges: the flinch layers over the base pose and gives it back.
    expect(quadrupedHitPose(realized, base, 0)).toEqual(base);
    expect(quadrupedHitPose(realized, base, HIT_FLINCH.duration)).toEqual(base);
    expect(quadrupedHitPose(realized, base, 0, 0.5)).toEqual(base);

    const flinch = quadrupedHitPose(realized, base, 0.08, 0.5);
    expect(flinch.rotations.head).not.toEqual(base.rotations.head);
    const surfaces = posedVoxelSurfaceBounds(realized, flinch);
    expect(surfaces.lowest).toBeGreaterThanOrEqual(-voxel);
    expect(surfaces.lowest).toBeLessThanOrEqual(voxel);
    // The recoil jolts the body without taking it off its feet: every paw stays within a step of
    // its ground contact (the flinch may lift one a couple of voxels as the trunk braces).
    for (const paw of QUADRUPED_SUPPORT_BONES) {
      const y = surfaces.byBone.get(paw) ?? Number.POSITIVE_INFINITY;
      expect(y).toBeGreaterThanOrEqual(-voxel);
      expect(y).toBeLessThanOrEqual(2 * voxel);
    }
  });

  it('every bone index survives the crowd sever-mask handoff', () => {
    const { realized } = figureFor(ANCHORS[0]!);
    const { body } = realized;
    const layout = crowdTextureLayout(body.bones.length, 1);
    const data = new Float32Array(layout.width * layout.height * 4);
    for (const index of body.bones.keys()) {
      packSeveredMask(data, layout, 0, [index]);
      expect(isSeveredInMask(data, layout, 0, index), `bone ${body.bones[index]!.id} (${index})`).toBe(true);
    }
    // Stump gore keys off the severed state of a cut's whole subtree, so every severable part's
    // hidden set must survive the same handoff.
    const byId = new Map(body.bones.map((bone, index) => [bone.id, index]));
    for (const part of QUADRUPED_SEVERABLE_PARTS) {
      const subtree = [...severedBoneSet(body.bones, [part])].map((id) => byId.get(id)!);
      expect(subtree.length).toBeGreaterThan(0);
      for (const index of subtree) {
        packSeveredMask(data, layout, 0, [index]);
        expect(isSeveredInMask(data, layout, 0, index), `part ${part} index ${index}`).toBe(true);
      }
    }
  });

  it.each(QUADRUPED_SEVERABLE_PARTS)('severing %s leaves the body standing on its remaining paw contacts', (part) => {
    const { realized } = figureFor(ANCHORS[0]!);
    const hidden = severedBoneSet(realized.body.bones, [part]);
    const remainingPaws = QUADRUPED_SUPPORT_BONES.filter((paw) => !hidden.has(paw));
    const remainingBones = realized.body.bones.map((bone) => bone.id).filter((id) => !hidden.has(id));
    expect(remainingBones.length).toBeGreaterThan(0);
    const pose = groundQuadrupedPose(realized, quadrupedPose(realized), remainingPaws);
    const voxel = realized.voxels.size;
    // No cut can take every support at once, so the body always keeps contacts to stand on.
    expect(remainingPaws.length).toBeGreaterThan(0);
    const surfaces = posedVoxelSurfaceBoundsForBones(realized, pose, remainingBones);
    const resting = remainingPaws.map((paw) => surfaces.get(paw) ?? Number.POSITIVE_INFINITY);
    // The surviving body rests on its surviving contacts, neither hanging above nor sunk below them.
    for (const y of resting) {
      expect(Math.abs(y)).toBeLessThanOrEqual(voxel);
    }
    const lowestRemaining = Math.min(...surfaces.values());
    expect(lowestRemaining).toBeGreaterThanOrEqual(-voxel);
    expect(lowestRemaining).toBeLessThanOrEqual(voxel);
  });

  sweepGroup('additional quadruped support searches', () => {
    it.each(SWEEP_ANCHORS)('the gait keeps the body supported for search anchor %i', (anchor) => {
      const properties = gaitSupportProperties(anchor);
      expect(properties.length).toBeGreaterThan(0);
      expect(properties.every(Boolean)).toBe(true);
    });
  });
});
