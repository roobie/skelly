// Pure pieces of "crowd" rendering: packing a whole crowd's bone matrices into
// one shared texture instead of one Skeleton/bone-texture per actor, and the GLSL that reads it back.
// Three-free and DOM-free, so its packing is unit-testable without a renderer; mobActors.ts does the
// three.js-side wiring.
//
// Texture layout: one row per actor ("slot"), `bonesPerSlot * 3` texels for the bone matrices plus enough
// severed-bone mask words for every bone index (see crowdMaskTexelIndex/packSeveredMask below), so one
// actor's whole bone set and mask fit on one row. Each bone occupies 3 consecutive RGBA texels within its
// actor's row: a row-major 3x4 affine matrix, r0 r1 r2 tx | r3 r4 r5 ty | r6 r7 r8 tz (no perspective row —
// every transform here is rigid).

import type { MutableTransform } from '@skelly/engine/pose';

export interface CrowdTextureLayout {
  readonly bonesPerSlot: number;
  readonly maskTexelsPerSlot: number;
  readonly width: number;
  readonly height: number;
}

/** One Float32 red channel carries 24 exact integer bits; layouts allocate as many mask words as their bones need. */
export const CROWD_MASK_BITS_PER_TEXEL = 24;

export const crowdTextureLayout = (bonesPerSlot: number, slotCount: number): CrowdTextureLayout => {
  const maskTexelsPerSlot = Math.max(1, Math.ceil(bonesPerSlot / CROWD_MASK_BITS_PER_TEXEL));
  return {
    bonesPerSlot,
    maskTexelsPerSlot,
    width: bonesPerSlot * 3 + maskTexelsPerSlot,
    height: Math.max(1, slotCount),
  };
};

/** Flat Float32Array index (RGBA-interleaved) of bone `bone`'s first texel (row 0 of its 3x4 matrix) in
 * actor `slot`'s row. Add 4/8 for rows 1/2, as packCrowdBoneMatrix does. Goes through `layout.width` so
 * it stays correct with the per-slot mask words after the bone matrices. */
export const crowdTexelIndex = (layout: CrowdTextureLayout, slot: number, bone: number): number =>
  (slot * layout.width + bone * 3) * 4;

/** Flat Float32Array index of the actor's `maskWord` texel after its last bone matrix. Word zero also
 * stores bloodiness in green; additional words carry higher severed-bone indices. */
export const crowdMaskTexelIndex = (layout: CrowdTextureLayout, slot: number, maskWord = 0): number =>
  (slot * layout.width + layout.bonesPerSlot * 3 + maskWord) * 4;

/** Packs every severed bone index into its per-slot mask word. An index outside this layout is a caller
 * error: failing loudly is safer than silently losing stump-gore state. */
export const packSeveredMask = (
  data: Float32Array,
  layout: CrowdTextureLayout,
  slot: number,
  severedBoneIndices: Iterable<number>,
): void => {
  const firstMaskIndex = crowdMaskTexelIndex(layout, slot);
  for (let word = 0; word < layout.maskTexelsPerSlot; word++) {
    data[firstMaskIndex + word * 4] = 0;
  }
  for (const i of severedBoneIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= layout.bonesPerSlot) {
      throw new RangeError(`Severed bone index ${i} is outside a ${layout.bonesPerSlot}-bone crowd slot`);
    }
    const word = Math.floor(i / CROWD_MASK_BITS_PER_TEXEL);
    const bit = i % CROWD_MASK_BITS_PER_TEXEL;
    const index = firstMaskIndex + word * 4;
    data[index] = data[index]! | (1 << bit);
  }
};

/** Packs how bloodied `slot`'s body is, 0 (clean) to 1, into its mask texel's green channel.
 * CROWD_BEGIN_VERTEX hands it on as `vCrowdBloodiness`, with the bone-local position and bone, for a host to
 * shade stains from (render/bloodStain.ts). A reused row keeps the last value written, so every
 * packer writes it. */
export const packBloodiness = (
  data: Float32Array,
  layout: CrowdTextureLayout,
  slot: number,
  bloodiness: number,
): void => {
  data[crowdMaskTexelIndex(layout, slot) + 1] = Math.min(1, Math.max(0, bloodiness));
};

/** Packs the multiplier on `slot`'s charged materials' emission into its mask texel's blue channel; a
 * vertex's `crowdEmission` attribute says whether its material is charged. A reused row keeps the last
 * value written, so every packer writes it. */
export const packCharge = (data: Float32Array, layout: CrowdTextureLayout, slot: number, charge: number): void => {
  data[crowdMaskTexelIndex(layout, slot) + 2] = Math.max(0, charge);
};

/** Whether the texture mask says `boneIndex` was severed. The shader applies the same word/bit split in
 * crowdBoneSevered; this helper lets the maintained CPU contract tests inspect the packed representation. */
export const isSeveredInMask = (
  data: Float32Array,
  layout: CrowdTextureLayout,
  slot: number,
  boneIndex: number,
): boolean => {
  if (boneIndex < 0 || boneIndex >= layout.bonesPerSlot) {
    return false;
  }
  const word = Math.floor(boneIndex / CROWD_MASK_BITS_PER_TEXEL);
  const bit = boneIndex % CROWD_MASK_BITS_PER_TEXEL;
  const mask = data[crowdMaskTexelIndex(layout, slot, word)]!;
  return (((mask >>> 0) >>> bit) & 1) === 1;
};

/** WebGL2's guaranteed `MAX_TEXTURE_SIZE`: a texture no wider or taller uploads on every conforming implementation. */
const CROWD_TEXTURE_MAX_SIZE = 2048;

/**
 * A fused-mass variant's carved-cell mask, single-channel, CROWD_MASK_BITS_PER_TEXEL cells per texel. Each slot owns
 * `rowsPerSlot` consecutive rows, so its words wrap within the guaranteed texture width and stay one contiguous run.
 */
export interface CrowdCellMaskLayout {
  readonly cellCount: number;
  readonly width: number;
  readonly rowsPerSlot: number;
  readonly height: number;
}

export const crowdCellMaskLayout = (
  cellCount: number,
  slotCount: number,
  maxSize = CROWD_TEXTURE_MAX_SIZE,
): CrowdCellMaskLayout => {
  const words = Math.max(1, Math.ceil(cellCount / CROWD_MASK_BITS_PER_TEXEL));
  const width = Math.min(words, maxSize);
  const rowsPerSlot = Math.ceil(words / width);
  const height = Math.max(1, slotCount) * rowsPerSlot;
  if (height > maxSize) {
    throw new RangeError(`A ${cellCount}-cell mask for ${slotCount} slots needs ${height} rows, over ${maxSize}`);
  }
  return { cellCount, width, rowsPerSlot, height };
};

/** Packs every carved cell index into `slot`'s rows, clearing the rest. An index outside the grid is a caller error. */
export const packCellMask = (
  data: Float32Array,
  layout: CrowdCellMaskLayout,
  slot: number,
  cells: Iterable<number>,
): void => {
  const first = slot * layout.rowsPerSlot * layout.width;
  data.fill(0, first, first + layout.rowsPerSlot * layout.width);
  for (const cell of cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= layout.cellCount) {
      throw new RangeError(`Carved cell ${cell} is outside a ${layout.cellCount}-cell grid`);
    }
    const index = first + Math.floor(cell / CROWD_MASK_BITS_PER_TEXEL);
    data[index] = data[index]! | (1 << (cell % CROWD_MASK_BITS_PER_TEXEL));
  }
};

/** Whether the cell mask says `cell` is carved in `slot`'s rows, by the same word/bit split as crowdCellCarved. */
export const isCellInMask = (data: Float32Array, layout: CrowdCellMaskLayout, slot: number, cell: number): boolean => {
  if (cell < 0 || cell >= layout.cellCount) {
    return false;
  }
  const mask = data[slot * layout.rowsPerSlot * layout.width + Math.floor(cell / CROWD_MASK_BITS_PER_TEXEL)]!;
  return (((mask >>> 0) >>> (cell % CROWD_MASK_BITS_PER_TEXEL)) & 1) === 1;
};

/** A crowd placement: yaw about Y (radians, three.js convention: yaw 0 faces -Z) plus a translation,
 * applied to every bone. `y` is an ADDITIONAL offset on top of whatever Y the pose itself already has
 * (a walk pose puts the lowest foot at the pose's local y = 0), so `y` is exactly "where the ground is":
 * a per-actor height on uneven terrain. */
export interface CrowdPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawRad: number;
}

/** Where one bone's matrix lives in the shared texture — grouped since `layout`/`slot`/`bone` always
 * travel together and individually would put packCrowdBoneMatrix over useMaxParams. */
export interface CrowdTexel {
  readonly layout: CrowdTextureLayout;
  readonly slot: number;
  readonly bone: number;
}

/**
 * Writes `texel.bone`'s WORLD transform (placement ∘ boneWorld, where `boneWorld` is
 * core/pose.ts's boneTransformsInto own output — already "world, if this actor's root sat at the scene
 * origin") for actor `texel.slot` into `data` (the shared texture's backing array). Composes the
 * placement by hand (r' = Ry·r, t' = Ry·t + [x,0,z], with Ry = core/boneMath.ts's rotY(yawDeg) — see its own
 * [c,0,s; 0,1,0; -s,0,c] layout) instead of calling core/boneMath.ts's compose()/rotation()/translation():
 * those each allocate a fresh Mat3/Vec3/Transform, and this runs for every bone of every actor of every
 * frame (the same allocation-avoidance reason as boneTransformsInto itself). Verified equal
 * to compose(translation([x,0,z]), rotation(rotY(deg))) composed onto boneWorld by hand in this
 * module's own derivation and cross-checked in `packages/deadvox/test/crowd.test.ts` against
 * boneTransformsInto + core/boneMath.ts's compose, applied to real points.
 */
export const packCrowdBoneMatrix = (
  data: Float32Array,
  texel: CrowdTexel,
  boneWorld: MutableTransform,
  placement: CrowdPlacement,
): void => {
  const cos = Math.cos(placement.yawRad);
  const sin = Math.sin(placement.yawRad);
  const r = boneWorld.r;
  const t = boneWorld.t;
  const r0 = cos * r[0] + sin * r[6];
  const r1 = cos * r[1] + sin * r[7];
  const r2 = cos * r[2] + sin * r[8];
  const r6 = cos * r[6] - sin * r[0];
  const r7 = cos * r[7] - sin * r[1];
  const r8 = cos * r[8] - sin * r[2];
  const tx = cos * t[0] + sin * t[2] + placement.x;
  const tz = cos * t[2] - sin * t[0] + placement.z;
  const i = crowdTexelIndex(texel.layout, texel.slot, texel.bone);
  data[i] = r0;
  data[i + 1] = r1;
  data[i + 2] = r2;
  data[i + 3] = tx;
  data[i + 4] = r[3];
  data[i + 5] = r[4];
  data[i + 6] = r[5];
  data[i + 7] = t[1] + placement.y;
  data[i + 8] = r6;
  data[i + 9] = r7;
  data[i + 10] = r8;
  data[i + 11] = tz;
};

// ---- GLSL: patched into a material's vertex shader via onBeforeCompile (see mobActors.ts for the
// three.js-side wiring). Plain strings, so this module stays three-free. Written in three.js's own pre-r163-style GLSL (attribute/
// texture2D, matching e.g. its skinning_pars_vertex.glsl.js), not GLSL ES 300's in/out/texture: three
// always compiles non-raw materials as `#version 300 es` and macro-converts that classic syntax
// (`#define attribute in` etc.) regardless of the material's own `glslVersion` — checked against the
// installed three.js version's WebGLProgram.js. texelFetch/ivec2 are genuine GLSL ES 300 builtins,
// natively available either way.

export const CROWD_VERTEX_DECLARATIONS = /* glsl */ `
uniform highp sampler2D crowdBoneTexture;
uniform float crowdBonesPerSlot;
attribute float crowdSlot;
attribute float boneIndex;
attribute float neighbourBone;
attribute vec2 crowdEmission;
varying float vCrowdGore;
varying float vCrowdEmission;
varying float vCrowdBloodiness;
varying vec3 vCrowdLocal;
varying float vCrowdBone;

mat4 crowdBoneMatrix( float slot, float bone ) {

	int x = int( bone ) * 3;
	int y = int( slot );
	vec4 c0 = texelFetch( crowdBoneTexture, ivec2( x, y ), 0 );
	vec4 c1 = texelFetch( crowdBoneTexture, ivec2( x + 1, y ), 0 );
	vec4 c2 = texelFetch( crowdBoneTexture, ivec2( x + 2, y ), 0 );

	return mat4(
		vec4( c0.x, c1.x, c2.x, 0.0 ),
		vec4( c0.y, c1.y, c2.y, 0.0 ),
		vec4( c0.z, c1.z, c2.z, 0.0 ),
		vec4( c0.w, c1.w, c2.w, 1.0 )
	);

}

// Dismemberment: the mask words after the bones (see crowdMaskTexelIndex) hold this actor's severed-bone
// bits, with CROWD_MASK_BITS_PER_TEXEL indices per word (see packSeveredMask). A severed bone's own
// matrix is written as all zeros on the CPU side (mobActors.ts), which alone collapses every one of its
// vertices to the origin — degenerate, so hiding it needs no shader logic at all. This mask is only for the
// *gore* tint below: a survivor bone whose neighbourBone has just been severed needs to know that, and the
// neighbour's own (now-zeroed) matrix doesn't carry that information any more once it's collapsed.
bool crowdBoneSevered( float slot, float bone ) {

	if ( bone < 0.0 ) return false; // -1: this face's neighbour is empty space, never "severed"
	int boneIndex = int( bone );
	int word = boneIndex / ${CROWD_MASK_BITS_PER_TEXEL};
	int bit = boneIndex % ${CROWD_MASK_BITS_PER_TEXEL};
	int x = int( crowdBonesPerSlot ) * 3 + word;
	int y = int( slot );
	int mask = int( texelFetch( crowdBoneTexture, ivec2( x, y ), 0 ).x );
	return ( mask & ( 1 << bit ) ) != 0;

}

// Blood: the mask texel's green channel says how bloodied the body is (packBloodiness).
float crowdBloodiness( float slot ) {

	return texelFetch( crowdBoneTexture, ivec2( int( crowdBonesPerSlot ) * 3, int( slot ) ), 0 ).y;

}

// Emission: the material's own level, scaled by the actor's charge (packCharge) where crowdEmission.y says so.
float crowdCharge( float slot ) {

	return texelFetch( crowdBoneTexture, ivec2( int( crowdBonesPerSlot ) * 3, int( slot ) ), 0 ).z;

}
`;

// Computed independently in each replacement (rather than sharing one `crowdM` local) since
// <beginnormal_vertex> runs *before* <begin_vertex> in three's own vertex shader templates (checked
// against the installed three.js version's ShaderLib/meshphysical.glsl.js AND meshlambert.glsl.js — both
// materials use the same chunk order) — three extra texelFetches per vertex, cheap, and it means this
// doesn't silently break if three ever reorders those chunks again.
export const CROWD_BEGIN_VERTEX = /* glsl */ `
mat4 crowdM = crowdBoneMatrix( crowdSlot, boneIndex );
vec3 transformed = ( crowdM * vec4( position, 1.0 ) ).xyz;
vCrowdGore = crowdBoneSevered( crowdSlot, neighbourBone ) ? 1.0 : 0.0;
// Bone-local, so anything shaded from it stays put on the body as it moves.
vCrowdBloodiness = crowdBloodiness( crowdSlot );
vCrowdLocal = position;
vCrowdBone = boneIndex;
vCrowdEmission = crowdEmission.x * mix( 1.0, crowdCharge( crowdSlot ), crowdEmission.y );
`;

// Carving: a vertex of a carved cell (packCellMask) collapses to the origin, as a severed bone's do. The mask's
// slots start at the variant's first slot; a slot outside them (the hidden row) is never carved. A slot's words
// run on across its `crowdCellRowsPerSlot` rows, as crowdCellMaskLayout lays them out.
export const CROWD_CELL_VERTEX_DECLARATIONS = /* glsl */ `
uniform highp sampler2D crowdCellTexture;
uniform float crowdCellSlotBase;
uniform float crowdCellRowsPerSlot;
attribute float cellIndex;

bool crowdCellCarved( float slot, float cell ) {

	ivec2 size = textureSize( crowdCellTexture, 0 );
	int rows = int( crowdCellRowsPerSlot );
	int local = int( slot ) - int( crowdCellSlotBase );
	if ( local < 0 || local * rows >= size.y ) return false;
	int index = int( cell );
	int word = index / ${CROWD_MASK_BITS_PER_TEXEL};
	ivec2 texel = ivec2( word % size.x, local * rows + word / size.x );
	int mask = int( texelFetch( crowdCellTexture, texel, 0 ).x );
	return ( mask & ( 1 << ( index % ${CROWD_MASK_BITS_PER_TEXEL} ) ) ) != 0;

}
`;

export const CROWD_CELL_BEGIN_VERTEX = /* glsl */ `
if ( crowdCellCarved( crowdSlot, cellIndex ) ) transformed = vec3( 0.0 );
`;

export const CROWD_BEGINNORMAL_VERTEX = /* glsl */ `
mat4 crowdNormalM = crowdBoneMatrix( crowdSlot, boneIndex );
vec3 objectNormal = mat3( crowdNormalM ) * normal;
`;

export const CROWD_FRAGMENT_DECLARATIONS = /* glsl */ `
varying float vCrowdGore;
varying float vCrowdEmission;
`;

// Patched in after <emissivemap_fragment>: a glowing voxel emits its own colour, so it reads as a light
// source in the dark and feeds bloom instead of darkening with the scene.
export const CROWD_EMISSIVE_FRAGMENT = /* glsl */ `
totalEmissiveRadiance += diffuseColor.rgb * vCrowdEmission;
`;

// Apply after vertex colour so a fresh cut remains legible even against light flesh.
export const CROWD_COLOR_FRAGMENT = /* glsl */ `
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.09, 0.06 ), vCrowdGore * 0.85 );
`;
