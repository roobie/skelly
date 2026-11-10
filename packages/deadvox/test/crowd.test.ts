// Pure-math tests for src/render/crowd.ts, the crowd bone-matrix packing the zombie renderer
// (src/render/mobActors.ts) uploads, over the fixture actor body's skeleton.

import { readFileSync } from 'node:fs';
import { compose, rotation, translation } from '@skelly/engine/internal/core/boneMath.ts';
import {
  allocateBoneTransforms,
  applyPoint,
  type BuiltBone,
  bodySkeleton,
  boneTransformsInto,
  indexBonesByParent,
  type Pose,
  rotY,
  type Transform,
  type Vec3,
} from '@skelly/engine/pose';
import {
  CROWD_MASK_BITS_PER_TEXEL,
  type CrowdCellMaskLayout,
  crowdCellMaskLayout,
  crowdMaskTexelIndex,
  crowdTexelIndex,
  crowdTextureLayout,
  isCellInMask,
  isSeveredInMask,
  packBloodiness,
  packCellMask,
  packCharge,
  packCrowdBoneMatrix,
  packSeveredMask,
} from '@skelly/presentation/internal/render/crowd.ts';
import { describe, expect, it } from 'vitest';

const bones = bodySkeleton(
  JSON.parse(readFileSync(new URL('./fixtures/actors/fixture.body.json', import.meta.url), 'utf8')) as {
    readonly bones: readonly BuiltBone[];
  },
);

const somePose = (): Pose => ({
  root: [0.05, -0.12, 0.3],
  rotations: Object.fromEntries(
    bones.map((bone, i) => {
      const a = i * 0.31;
      return [bone.id, [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]] as const;
    }),
  ),
});

describe('packCrowdBoneMatrix (the pure part of crowd mode)', () => {
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
    expect(layout.width).toBe(55); // 18 bones * 3 texels + 1 mask word — see crowdMaskTexelIndex
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

  it('keeps actor slots independent in the severed mask', () => {
    const layout = crowdTextureLayout(CROWD_MASK_BITS_PER_TEXEL * 3, 2);
    const data = new Float32Array(layout.width * layout.height * 4);
    const severed = [0, 5, 17, 24, 37, 59];
    packSeveredMask(data, layout, 0, severed);
    packSeveredMask(data, layout, 1, []);
    for (let bone = 0; bone < layout.bonesPerSlot; bone++) {
      expect(isSeveredInMask(data, layout, 0, bone)).toBe(severed.includes(bone));
      expect(isSeveredInMask(data, layout, 1, bone)).toBe(false);
    }
  });

  it('packs charge beside the severed mask and bloodiness without clobbering either', () => {
    const layout = crowdTextureLayout(CROWD_MASK_BITS_PER_TEXEL, 1);
    const data = new Float32Array(layout.width * layout.height * 4);
    packSeveredMask(data, layout, 0, [3]);
    packBloodiness(data, layout, 0, 0.4);
    packCharge(data, layout, 0, 2.5);
    expect(isSeveredInMask(data, layout, 0, 3)).toBe(true);
    expect(data[crowdMaskTexelIndex(layout, 0) + 1]).toBeCloseTo(0.4);
    expect(data[crowdMaskTexelIndex(layout, 0) + 2]).toBe(2.5);
  });

  it('round-trips each bit across multiple mask words without cross-bit corruption', () => {
    const bonesPerSlot = CROWD_MASK_BITS_PER_TEXEL * 3;
    const layout = crowdTextureLayout(bonesPerSlot, 1);
    for (let bone = 0; bone < bonesPerSlot; bone++) {
      const data = new Float32Array(layout.width * layout.height * 4);
      packSeveredMask(data, layout, 0, [bone]);
      for (let check = 0; check < bonesPerSlot; check++) {
        expect(isSeveredInMask(data, layout, 0, check)).toBe(check === bone);
      }
    }
  });

  it('rejects severed bone indices outside the allocated crowd slot', () => {
    const layout = crowdTextureLayout(4, 1);
    const data = new Float32Array(layout.width * layout.height * 4);
    expect(() => packSeveredMask(data, layout, 0, [-1])).toThrow(RangeError);
    expect(() => packSeveredMask(data, layout, 0, [layout.bonesPerSlot])).toThrow(RangeError);
  });
});

describe('cell mask layout', () => {
  // A fixture grid whose mask words need three rows per slot under a fixture size limit.
  const maxSize = 16;
  const cellCount = CROWD_MASK_BITS_PER_TEXEL * (maxSize * 2 + 3);
  const slotCount = 3;

  /** The texel the vertex shader (CROWD_CELL_VERTEX_DECLARATIONS) reads for `cell` in `slot`, as a flat index. */
  const shaderTexel = (layout: CrowdCellMaskLayout, slot: number, cell: number): number => {
    const word = Math.floor(cell / CROWD_MASK_BITS_PER_TEXEL);
    const row = slot * layout.rowsPerSlot + Math.floor(word / layout.width);
    return row * layout.width + (word % layout.width);
  };

  it('wraps a slot wider than the size limit over rows and keeps the texture within it', () => {
    const layout = crowdCellMaskLayout(cellCount, slotCount, maxSize);
    expect(layout.width).toBeLessThanOrEqual(maxSize);
    expect(layout.rowsPerSlot).toBeGreaterThan(1);
    expect(layout.height).toBeLessThanOrEqual(maxSize);
    expect(() => crowdCellMaskLayout(cellCount, maxSize, maxSize)).toThrow(RangeError);
  });

  it("sets a carved cell's bit in its own slot only, where the shader reads it, and clears it on repacking", () => {
    const layout = crowdCellMaskLayout(cellCount, slotCount, maxSize);
    const data = new Float32Array(layout.width * layout.height);
    // Cells at word and row boundaries, and the last cell.
    const carved = [0, CROWD_MASK_BITS_PER_TEXEL - 1, CROWD_MASK_BITS_PER_TEXEL * maxSize, cellCount - 1];
    packCellMask(data, layout, 1, carved);
    for (let slot = 0; slot < slotCount; slot++) {
      for (let cell = 0; cell < cellCount; cell++) {
        const expected = slot === 1 && carved.includes(cell);
        expect(isCellInMask(data, layout, slot, cell)).toBe(expected);
        const word = data[shaderTexel(layout, slot, cell)]!;
        expect(((word >>> (cell % CROWD_MASK_BITS_PER_TEXEL)) & 1) === 1).toBe(expected);
      }
    }
    packCellMask(data, layout, 1, []);
    expect(data.every((word) => word === 0)).toBe(true);
  });
});
