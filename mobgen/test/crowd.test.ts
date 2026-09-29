// Pure-math tests for src/mob/crowd.ts (mobgen/CHALLENGES.md §1) — the shared crowd bone-matrix packing
// deadvox's own zombie renderer imports directly (via the `@mobgen/` alias), independent of mobgen's
// three.js-touching viewer layer. See test/stressActors.test.ts for the three.js-side integration
// (buildCrowdRender) that still lives in mobgen/src/viewer.

import { describe, expect, it } from 'vitest';
import { generateValid, realize } from '../src/core/generate.ts';
import { applyPoint, compose, rotation, rotY, type Transform, translation, type Vec3 } from '../src/core/math.ts';
import { allocateBoneTransforms, boneTransformsInto, indexBonesByParent, type Pose } from '../src/core/pose.ts';
import {
  CROWD_MASK_MAX_BONES,
  crowdMaskTexelIndex,
  crowdTexelIndex,
  crowdTextureLayout,
  isSeveredInMask,
  packCrowdBoneMatrix,
  packSeveredMask,
} from '../src/mob/crowd.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const shambler = TEMPLATES.find((t) => t.name === 'shambler')!;
const found = generateValid(shambler, 1)!;
const { body } = realize(found.genome);
const { bones } = body;

const somePose = (): Pose => ({
  root: [0.05, -0.12, 0.3],
  rotations: Object.fromEntries(
    bones.map((bone, i) => {
      const a = i * 0.31;
      return [bone.id, [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]] as const;
    }),
  ),
});

describe('packCrowdBoneMatrix (mobgen/CHALLENGES.md §1: the pure part of crowd mode)', () => {
  it('unpacked matrix per bone, applied to a point, equals placement ∘ boneTransformsInto applied to the same point', () => {
    const parentIndex = indexBonesByParent(bones);
    const scratch = allocateBoneTransforms(bones.length);
    const pose = somePose();
    boneTransformsInto(bones, pose, parentIndex, scratch);

    // y != 0 too: deadvox places zombies on uneven terrain, unlike mobgen's own flat-plane stress page.
    const placement = { x: 2, y: 1.5, z: 3, yawRad: 0.7 };
    const crowdTransform = compose(
      translation([placement.x, placement.y, placement.z]),
      rotation(rotY((placement.yawRad * 180) / Math.PI)),
    );

    const layout = crowdTextureLayout(bones.length, 1);
    const data = new Float32Array(layout.width * layout.height * 4);

    for (const [bone, boneData] of bones.entries()) {
      packCrowdBoneMatrix(data, { layout, slot: 0, bone }, scratch[bone]!, placement);
      const expected: Transform = compose(crowdTransform, { r: scratch[bone]!.r, t: scratch[bone]!.t });

      const i = crowdTexelIndex(layout, 0, bone);
      const packed: Transform = {
        r: [
          data[i]!,
          data[i + 1]!,
          data[i + 2]!,
          data[i + 4]!,
          data[i + 5]!,
          data[i + 6]!,
          data[i + 8]!,
          data[i + 9]!,
          data[i + 10]!,
        ],
        t: [data[i + 3]!, data[i + 7]!, data[i + 11]!],
      };

      // Several points, not just bone.head (often near an axis, which can hide a transposed-matrix bug):
      // head, tail, and an arbitrary offset point.
      const [hx, hy, hz] = boneData.head;
      const testPoints: readonly Vec3[] = [boneData.head, boneData.tail, [hx + 0.1, hy + 0.2, hz - 0.15]];
      for (const p of testPoints) {
        const expectedWorld = applyPoint(expected, p);
        const actualWorld = applyPoint(packed, p);
        // `data` is a Float32Array (the texture's own storage) — 5 decimal places (~1e-5), not 9: the
        // reference side (`expected`) is full float64, so this bounds Float32 rounding, not a logic bug.
        expect(actualWorld[0]).toBeCloseTo(expectedWorld[0], 5);
        expect(actualWorld[1]).toBeCloseTo(expectedWorld[1], 5);
        expect(actualWorld[2]).toBeCloseTo(expectedWorld[2], 5);
      }
    }
  });

  it("crowdTextureLayout keeps one actor's whole bone set (plus its severed-mask texel) on one texture row", () => {
    const layout = crowdTextureLayout(18, 5);
    expect(layout.width).toBe(55); // 18 bones * 3 texels + 1 mask texel — see crowdMaskTexelIndex
    expect(layout.height).toBe(5);
    // Every texel for slot s, any bone, falls within row s: index (in texels, not floats) is s*width + x
    // for some 0 <= x < width — i.e. flooring texelIndex/width recovers the slot exactly.
    for (let slot = 0; slot < 5; slot++) {
      for (let bone = 0; bone < 18; bone++) {
        const texelIndex = crowdTexelIndex(layout, slot, bone) / 4; // crowdTexelIndex is in floats (RGBA)
        expect(Math.floor(texelIndex / layout.width)).toBe(slot);
      }
    }
  });

  it("the mask texel sits right after a slot's last bone, still within that slot's own row", () => {
    const layout = crowdTextureLayout(18, 5);
    for (let slot = 0; slot < 5; slot++) {
      const maskTexel = crowdMaskTexelIndex(layout, slot) / 4;
      expect(Math.floor(maskTexel / layout.width)).toBe(slot);
      expect(maskTexel % layout.width).toBe(layout.bonesPerSlot * 3); // the one texel past the last bone
    }
  });

  it('packSeveredMask/isSeveredInMask round-trip an arbitrary bone set through one float texel', () => {
    const layout = crowdTextureLayout(18, 2);
    const data = new Float32Array(layout.width * layout.height * 4);
    packSeveredMask(data, layout, 0, [0, 5, 17]);
    packSeveredMask(data, layout, 1, []); // a different slot's mask is independent
    const mask0 = data[crowdMaskTexelIndex(layout, 0)]!;
    const mask1 = data[crowdMaskTexelIndex(layout, 1)]!;
    for (let bone = 0; bone < 18; bone++) {
      expect(isSeveredInMask(mask0, bone)).toBe(bone === 0 || bone === 5 || bone === 17);
      expect(isSeveredInMask(mask1, bone)).toBe(false);
    }
  });

  it('round-trips every bone up to CROWD_MASK_MAX_BONES - 1 individually (no cross-bit corruption)', () => {
    const layout = crowdTextureLayout(CROWD_MASK_MAX_BONES, 1);
    for (let bone = 0; bone < CROWD_MASK_MAX_BONES; bone++) {
      const data = new Float32Array(layout.width * layout.height * 4);
      packSeveredMask(data, layout, 0, [bone]);
      const mask = data[crowdMaskTexelIndex(layout, 0)]!;
      for (let check = 0; check < CROWD_MASK_MAX_BONES; check++) {
        expect(isSeveredInMask(mask, check)).toBe(check === bone);
      }
    }
  });

  it('drops a bone index at or beyond CROWD_MASK_MAX_BONES rather than corrupting the mask', () => {
    const layout = crowdTextureLayout(CROWD_MASK_MAX_BONES + 4, 1);
    const data = new Float32Array(layout.width * layout.height * 4);
    packSeveredMask(data, layout, 0, [2, CROWD_MASK_MAX_BONES, CROWD_MASK_MAX_BONES + 1]);
    const mask = data[crowdMaskTexelIndex(layout, 0)]!;
    expect(isSeveredInMask(mask, 2)).toBe(true);
    // The out-of-range indices must not have wrapped or corrupted the low bits.
    for (let bone = 0; bone < CROWD_MASK_MAX_BONES; bone++) {
      expect(isSeveredInMask(mask, bone)).toBe(bone === 2);
    }
  });
});
