// Pure pieces of "crowd" rendering (mobgen/CHALLENGES.md §1): packing a whole crowd's bone matrices into
// one shared texture instead of one Skeleton/bone-texture per actor, and the GLSL that reads it back.
// Deliberately three-free and DOM-free — deadvox imports this module directly (via the `@mobgen/` alias)
// to build its own zombie renderer, and must never pull in mobgen/src/viewer (which imports three from
// *mobgen's* node_modules, not deadvox's — see mobgen/src/viewer/stressActors.ts, the original home of
// this code, for the three.js-side builder that still lives there: buildCrowdGeometry, buildCrowdRender).
//
// Texture layout: one row per actor ("slot"), `bonesPerSlot * 3` texels wide, so one actor's whole bone
// set fits on one row — no wraparound to reason about in the packing code below or in the shader's texel
// math. Each bone occupies 3 consecutive RGBA texels within its actor's row: a row-major 3x4 affine
// matrix, r0 r1 r2 tx | r3 r4 r5 ty | r6 r7 r8 tz (no perspective row — every transform here is rigid).

import type { MutableTransform } from '../core/pose.ts';

export interface CrowdTextureLayout {
  readonly bonesPerSlot: number;
  readonly width: number;
  readonly height: number;
}

export const crowdTextureLayout = (bonesPerSlot: number, slotCount: number): CrowdTextureLayout => ({
  bonesPerSlot,
  width: bonesPerSlot * 3,
  height: Math.max(1, slotCount),
});

/** Flat Float32Array index (RGBA-interleaved) of bone `bone`'s first texel (row 0 of its 3x4 matrix) in
 * actor `slot`'s row. Add 4/8 for rows 1/2, as packCrowdBoneMatrix does. */
export const crowdTexelIndex = (layout: CrowdTextureLayout, slot: number, bone: number): number =>
  (slot * layout.bonesPerSlot + bone) * 3 * 4;

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
attribute float crowdSlot;
attribute float boneIndex;

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
`;

// Computed independently in each replacement (rather than sharing one `crowdM` local) since
// <beginnormal_vertex> runs *before* <begin_vertex> in three's own vertex shader templates (checked
// against the installed three.js version's ShaderLib/meshphysical.glsl.js AND meshlambert.glsl.js — both
// materials use the same chunk order) — three extra texelFetches per vertex, cheap, and it means this
// doesn't silently break if three ever reorders those chunks again.
export const CROWD_BEGIN_VERTEX = /* glsl */ `
mat4 crowdM = crowdBoneMatrix( crowdSlot, boneIndex );
vec3 transformed = ( crowdM * vec4( position, 1.0 ) ).xyz;
`;

export const CROWD_BEGINNORMAL_VERTEX = /* glsl */ `
mat4 crowdNormalM = crowdBoneMatrix( crowdSlot, boneIndex );
vec3 objectNormal = mat3( crowdNormalM ) * normal;
`;
