// Pure pieces of "crowd" rendering (mobgen/CHALLENGES.md §1): packing a whole crowd's bone matrices into
// one shared texture instead of one Skeleton/bone-texture per actor, and the GLSL that reads it back.
// Deliberately three-free and DOM-free — deadvox imports this module directly (via the `@mobgen/` alias)
// to build its own zombie renderer, and must never pull in mobgen/src/viewer (which imports three from
// *mobgen's* node_modules, not deadvox's — see mobgen/src/viewer/stressActors.ts, the original home of
// this code, for the three.js-side builder that still lives there: buildCrowdGeometry, buildCrowdRender).
//
// Texture layout: one row per actor ("slot"), `bonesPerSlot * 3` texels wide for the bone matrices plus
// one more for the severed-bone mask (see crowdMaskTexelIndex/packSeveredMask below — dismemberment), so
// one actor's whole bone set plus its mask fits on one row — no wraparound to reason about in the packing
// code below or in the shader's texel math. Each bone occupies 3 consecutive RGBA texels within its
// actor's row: a row-major 3x4 affine matrix, r0 r1 r2 tx | r3 r4 r5 ty | r6 r7 r8 tz (no perspective row —
// every transform here is rigid).

import type { MutableTransform } from '../core/pose.ts';

export interface CrowdTextureLayout {
  readonly bonesPerSlot: number;
  readonly width: number;
  readonly height: number;
}

export const crowdTextureLayout = (bonesPerSlot: number, slotCount: number): CrowdTextureLayout => ({
  bonesPerSlot,
  width: bonesPerSlot * 3 + 1,
  height: Math.max(1, slotCount),
});

/** Flat Float32Array index (RGBA-interleaved) of bone `bone`'s first texel (row 0 of its 3x4 matrix) in
 * actor `slot`'s row. Add 4/8 for rows 1/2, as packCrowdBoneMatrix does. Goes through `layout.width` (not
 * `bonesPerSlot * 3`) so it stays correct now that a row is one texel wider than the bones alone. */
export const crowdTexelIndex = (layout: CrowdTextureLayout, slot: number, bone: number): number =>
  (slot * layout.width + bone * 3) * 4;

/** Flat Float32Array index of the one extra texel per row holding the actor's flags, right after this
 * slot's last bone matrix: red is the severed-bone bitmask (packSeveredMask), green how bloodied the body
 * is (packBloodiness); blue and alpha are unused. */
export const crowdMaskTexelIndex = (layout: CrowdTextureLayout, slot: number): number =>
  (slot * layout.width + layout.bonesPerSlot * 3) * 4;

/** A float exactly represents every non-negative integer up to 2^24 — comfortably above any humanoid's
 * bone count today (18) — so a severed-bone bitmask (bit i set = bone i severed) round-trips through one
 * float texel with no precision loss, as long as no caller ever sets a bit at or above this. */
export const CROWD_MASK_MAX_BONES = 24;

/** Packs `severedBoneIndices` (this actor's own bone array indices — callers translate ids via their own
 * id→index map, e.g. `bones.findIndex`) into `slot`'s mask texel. Bones at or beyond CROWD_MASK_MAX_BONES
 * are silently dropped (would lose precision as a float) rather than corrupting the whole mask. */
export const packSeveredMask = (
  data: Float32Array,
  layout: CrowdTextureLayout,
  slot: number,
  severedBoneIndices: Iterable<number>,
): void => {
  let mask = 0;
  for (const i of severedBoneIndices) {
    if (i >= 0 && i < CROWD_MASK_MAX_BONES) {
      mask |= 1 << i;
    }
  }
  data[crowdMaskTexelIndex(layout, slot)] = mask >>> 0;
};

/** Packs how bloodied `slot`'s body is, 0 (clean) to 1, into its mask texel's green channel.
 * CROWD_BEGIN_VERTEX hands it on as `vCrowdBloodiness`, with the bone-local position and bone, for a host to
 * shade stains from (deadvox's render/bloodStain.ts). A reused row keeps the last value written, so every
 * packer writes it. */
export const packBloodiness = (
  data: Float32Array,
  layout: CrowdTextureLayout,
  slot: number,
  bloodiness: number,
): void => {
  data[crowdMaskTexelIndex(layout, slot) + 1] = Math.min(1, Math.max(0, bloodiness));
};

/** Whether `boneIndex`'s bit is set in a mask value read back from the texture (e.g. in a test — the
 * shader does the equivalent bit test itself, see CROWD_BEGIN_VERTEX). */
export const isSeveredInMask = (mask: number, boneIndex: number): boolean => ((mask >>> boneIndex) & 1) === 1;

/** A crowd placement: yaw about Y (radians, three.js/conventions.ts convention: yaw 0 faces -Z) plus a
 * translation — the same thing mobgen's 'bones' stress mode hands its wrapping Group and its 'skinned'
 * mode composes onto its root bone, just applied to every bone here instead of one Group/root. `y` is an
 * ADDITIONAL offset on top of whatever Y the pose itself already has (walkPose's own groundOffset puts
 * the lowest foot at the pose's local y = 0 — see mob/gait.ts — so `y` is exactly "where the ground is",
 * 0 for mobgen's own flat-plane stress page, a real per-actor height for deadvox's uneven terrain). */
export interface CrowdPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawRad: number;
}

/** Where one bone's matrix lives in the shared texture — grouped (see mob/gait.ts's GaitBasis for the
 * same reasoning) since `layout`/`slot`/`bone` always travel together and individually would put
 * packCrowdBoneMatrix over useMaxParams. */
export interface CrowdTexel {
  readonly layout: CrowdTextureLayout;
  readonly slot: number;
  readonly bone: number;
}

/**
 * Writes `texel.bone`'s WORLD transform (placement ∘ boneWorld, where `boneWorld` is
 * core/pose.ts's boneTransformsInto own output — already "world, if this actor's root sat at the scene
 * origin") for actor `texel.slot` into `data` (the shared texture's backing array). Composes the
 * placement by hand (r' = Ry·r, t' = Ry·t + [x,0,z], with Ry = core/math.ts's rotY(yawDeg) — see its own
 * [c,0,s; 0,1,0; -s,0,c] layout) instead of calling core/math.ts's compose()/rotation()/translation():
 * those each allocate a fresh Mat3/Vec3/Transform, and this runs for every bone of every actor of every
 * frame (see mobgen/CHALLENGES.md §1 — the same reasoning as boneTransformsInto itself). Verified equal
 * to compose(translation([x,0,z]), rotation(rotY(deg))) composed onto boneWorld by hand once in this
 * module's own derivation (see mobgen's report) and cross-checked in test/crowd.test.ts against
 * boneTransformsInto + core/math.ts's compose, applied to real points.
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

// ---- GLSL: patched into a material's vertex shader via onBeforeCompile (see mobgen/src/viewer/
// stressActors.ts's buildCrowdRender for the three.js-side wiring). Plain strings, three-free, so this
// module stays importable from deadvox. Written in three.js's own pre-r163-style GLSL (attribute/
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
varying float vCrowdGore;
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

// Dismemberment: one extra texel per row (right after the bones, at column bonesPerSlot*3 — see
// crowdMaskTexelIndex) holds this actor's severed-bone bitmask, bit i set = bone i severed (see
// packSeveredMask). A severed bone's own matrix is written as all zeros on the CPU side (mobActors.ts),
// which alone collapses every one of its vertices to the origin — degenerate, so hiding it needs no shader
// logic at all. This mask is only for the *gore* tint below: a survivor bone whose neighbourBone has just
// been severed needs to know that, and the neighbour's own (now-zeroed) matrix doesn't carry that
// information any more once it's collapsed.
bool crowdBoneSevered( float slot, float bone ) {

	if ( bone < 0.0 ) return false; // -1: this face's neighbour is empty space, never "severed"
	int x = int( crowdBonesPerSlot ) * 3;
	int y = int( slot );
	int mask = int( texelFetch( crowdBoneTexture, ivec2( x, y ), 0 ).x );
	int bit = 1 << int( bone );
	return ( mask & bit ) != 0;

}

// Blood: the mask texel's green channel says how bloodied the body is (packBloodiness).
float crowdBloodiness( float slot ) {

	return texelFetch( crowdBoneTexture, ivec2( int( crowdBonesPerSlot ) * 3, int( slot ) ), 0 ).y;

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
`;

export const CROWD_BEGINNORMAL_VERTEX = /* glsl */ `
mat4 crowdNormalM = crowdBoneMatrix( crowdSlot, boneIndex );
vec3 objectNormal = mat3( crowdNormalM ) * normal;
`;

export const CROWD_FRAGMENT_DECLARATIONS = /* glsl */ `
varying float vCrowdGore;
`;

// Patched in after <color_fragment> (where three applies the per-vertex colour, vColor, to diffuseColor —
// checked against the installed three.js version's meshlambert_frag/color_fragment.glsl.js), so the gore
// tint rides on top of whatever the voxel's own palette colour already contributed. Dark red, matching
// humanoid.ts's own wound "gore" material colour exactly (buildPalette's fixed [0.32, 0.09, 0.06], not
// genome-sampled) — a fresh cut reads as the same gore as an authored wound. Mostly (0.85) replaces the
// surviving bone's own colour right at the cut edge rather than just tinting it, so the seam reads clearly
// even against a light palette.
export const CROWD_COLOR_FRAGMENT = /* glsl */ `
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.09, 0.06 ), vCrowdGore * 0.85 );
`;
