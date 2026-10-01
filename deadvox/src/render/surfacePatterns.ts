// GLSL for the procedural surface patterns (schema.ts BLOCK_PATTERNS), spliced into the chunk
// fragment shader (chunks.ts). Everything is computed from world position in metres and the
// face normal, so the look doesn't depend on block size, and a pattern runs on across the
// whole merged quad and across quads.
//
// Each pattern returns a muted multiplicative shade around 1 (about 0.7 in joints, 0.9..1.1
// elsewhere). Anti-aliasing: `fw` is the pixel footprint in metres (fwidth of the surface
// coordinates, taken by the caller in uniform control flow). Lines are drawn with a
// footprint-wide edge, and the whole pattern's deviation from 1 fades out once the pixel
// footprint nears the pattern's smallest feature, so nothing shimmers at range.

import { BLOCK_PATTERNS } from '../core/schema.ts';

const DEFINES = BLOCK_PATTERNS.map((name, i) => `#define PAT_${name.toUpperCase()} ${i}.0`).join('\n');

export const SURFACE_PATTERN_GLSL = `
${DEFINES}

// Hoskins' hash without sine; cell coordinates are wrapped so large worlds keep precision.
float hash21(vec2 p) {
  p = mod(p, 512.0);
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  p = mod(p, 512.0);
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// The in-plane coordinates in metres: u runs along the wall and v up it; on floors and ceilings it's x, z.
vec2 surfaceUV(vec3 w, vec3 n) {
  vec3 a = abs(n);
  if (a.y > 0.5) return w.xz;
  if (a.x > 0.5) return vec2(w.z, w.y);
  return vec2(w.x, w.y);
}

// 1 on a line of half-width hw, falling off over one pixel footprint; d is the distance to the line in metres.
// The half-width of the edge ramp is floored: smoothstep with equal edges (fw == 0) is undefined in GLSL.
float lineMask(float d, float hw, float fw) {
  float w = max(0.5 * fw, 1e-6);
  return 1.0 - smoothstep(hw - w, hw + w, d);
}

// A pixel footprint made safe: NaN, negative and absurd values become "very far" (pattern fades to 1),
// and zero is floored so nothing divides by it.
float safeFootprint(float fw) {
  return (fw >= 0.0 && fw < 1e4) ? max(fw, 1e-5) : 1e4;
}

// 1 while a feature of the given period (metres) is well resolved, 0 once a period spans under ~3 pixels
// (fw / period > 0.35); always within [0, 1].
float featureFade(float fw, float period) {
  return 1.0 - smoothstep(0.1, 0.35, fw / period);
}

// The pattern multiplier is bounded and NaN-free: out-of-range values survive the HDR target and turn
// into white blobs after tone mapping and the MSAA resolve.
float safeShade(float s) {
  return isnan(s) ? 1.0 : clamp(s, 0.6, 1.25);
}

// Blocks of size.xy metres in rows, each row shifted by stagger of a block on alternate rows.
float masonry(vec2 uv, vec2 size, float stagger, float hw, float jitter, float jointShade, float fw, float seed) {
  float row = floor(uv.y / size.y);
  vec2 q = vec2(uv.x + mod(row, 2.0) * stagger * size.x, uv.y) / size;
  vec2 f = fract(q);
  vec2 d = min(f, 1.0 - f) * size;
  float joint = max(lineMask(d.x, hw, fw), lineMask(d.y, hw, fw));
  float tone = 1.0 + (hash21(floor(q) + seed) - 0.5) * jitter;
  return mix(tone, jointShade, joint);
}

// Nearest and second-nearest feature distance (cell units) and a hash of the nearest cell.
vec3 voronoi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float d1 = 8.0;
  float d2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      float d = length(g + hash22(i + g) - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = hash21(i + g + 17.0);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  return vec3(d1, d2, id);
}

// A pattern's shade. fw is the larger pixel footprint, fwv the footprint per axis, in metres.
float patternShade(float pat, vec2 uv, float fwRaw, vec2 fwvRaw, float seed) {
  float fw = safeFootprint(fwRaw);
  vec2 fwv = vec2(safeFootprint(fwvRaw.x), safeFootprint(fwvRaw.y));
  float shade = 1.0;
  float fadeSize = 1000.0; // smallest feature, metres: the deviation from 1 fades as fw approaches it
  if (pat == PAT_BRICK) {
    shade = masonry(uv, vec2(0.22, 0.075), 0.5, 0.005, 0.14, 0.78, fw, seed);
    fadeSize = 0.075;
  } else if (pat == PAT_DRESSED) {
    shade = masonry(uv, vec2(0.5, 0.3), 0.5, 0.004, 0.10, 0.84, fw, seed);
    shade *= 1.0 + (vnoise(uv * 7.0) - 0.5) * 0.05;
    fadeSize = 0.12;
  } else if (pat == PAT_TILES) {
    shade = masonry(uv, vec2(0.2), 0.0, 0.004, 0.06, 0.8, fw, seed);
    fadeSize = 0.12;
  } else if (pat == PAT_PLANKS) {
    float b = floor(uv.y / 0.18);
    float fv = fract(uv.y / 0.18);
    float q = (uv.x + hash21(vec2(b, 3.0)) * 1.3) / 1.3;
    float seam = max(lineMask(min(fv, 1.0 - fv) * 0.18, 0.003, fw), lineMask(min(fract(q), 1.0 - fract(q)) * 1.3, 0.003, fw));
    float tone = 1.0 + (hash21(vec2(floor(q), b) + seed) - 0.5) * 0.12;
    float grain = (vnoise(vec2(uv.x * 2.0 + b * 7.0, uv.y * 45.0)) - 0.5) * 0.07 * (1.0 - smoothstep(0.2, 0.6, fwv.y / 0.022));
    shade = mix(tone + grain, 0.72, seam);
    fadeSize = 0.1;
  } else if (pat == PAT_COBBLE) {
    vec3 v = voronoi(uv / 0.2 + seed);
    float dm = (v.y - v.x) * 0.2 * 0.5;
    float tone = (1.0 + (v.z - 0.5) * 0.16) * (0.93 + 0.07 * smoothstep(0.0, 0.03, dm));
    shade = mix(tone, 0.7, lineMask(dm, 0.012, fw));
    fadeSize = 0.12;
  } else if (pat == PAT_ROUGH) {
    vec3 v = voronoi(uv / 0.35 + seed);
    float dm = (v.y - v.x) * 0.35 * 0.5;
    float tone = 1.0 + (v.z - 0.5) * 0.10 + (vnoise(uv * 9.0) - 0.5) * 0.04 * (1.0 - smoothstep(0.1, 0.4, fw * 9.0));
    shade = mix(tone, 0.82, 0.55 * lineMask(dm, 0.02, fw));
    fadeSize = 0.2;
  } else if (pat == PAT_SIDING) {
    float b = floor(uv.y / 0.17);
    float fv = fract(uv.y / 0.17);
    float tone = (1.0 + (hash21(vec2(b, 5.0) + seed) - 0.5) * 0.08) * (1.0 - 0.14 * smoothstep(0.8, 1.0, fv));
    shade = mix(tone, 0.7, lineMask(min(fv, 1.0 - fv) * 0.17, 0.004, fw));
    fadeSize = 0.1;
  } else if (pat == PAT_CORRUGATED) {
    float sheet = uv.x / 0.912;
    float tone = 1.0 + (hash21(vec2(floor(sheet), 5.0) + seed) - 0.5) * 0.08;
    float rib = sin(uv.x / 0.076 * 6.2831853) * 0.10 * (1.0 - smoothstep(0.15, 0.5, fwv.x / 0.076));
    shade = mix(tone + rib, 0.78, lineMask(min(fract(sheet), 1.0 - fract(sheet)) * 0.912, 0.003, fw));
    fadeSize = 0.1;
  } else if (pat == PAT_SHINGLES) {
    float row = floor(uv.y / 0.15);
    float fv = fract(uv.y / 0.15);
    float q = (uv.x + hash21(vec2(row, 9.0)) * 0.25) / 0.25;
    float slot = lineMask(min(fract(q), 1.0 - fract(q)) * 0.25, 0.004, fw) * (1.0 - smoothstep(0.45, 0.55, fv));
    float tone = (1.0 + (hash21(vec2(floor(q), row) + seed) - 0.5) * 0.16) * (1.0 - 0.18 * smoothstep(0.75, 1.0, fv));
    shade = mix(tone, 0.7, max(slot, lineMask(min(fv, 1.0 - fv) * 0.15, 0.004, fw)));
    fadeSize = 0.1;
  } else if (pat == PAT_NOISE) {
    // Three octaves of value noise, each easing to its mean once the pixel footprint outgrows it.
    // Each octave's mean is 0.5 (uniform lattice hash), so a faded octave leaves no brightness shift.
    float n = 0.5 * mix(0.5, vnoise(uv / 0.9), featureFade(fw, 0.9))
      + 0.3 * mix(0.5, vnoise(uv / 0.37 + 11.0), featureFade(fw, 0.37))
      + 0.2 * mix(0.5, vnoise(uv / 0.15 + 23.0), featureFade(fw, 0.15));
    shade = 0.91 + 0.16 * n;
  }
  return safeShade(1.0 + (shade - 1.0) * (1.0 - smoothstep(0.2, 0.6, fw / fadeSize)));
}
`;
