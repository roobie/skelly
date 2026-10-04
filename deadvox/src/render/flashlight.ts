// The beam of the light in your hands: a three.js spot light at the held model's lens,
// pointing where you look (SLICE-1.md, "Dark interiors": moving lights stay three.js
// lights when voxel light arrives). It stays in the scene with no intensity while
// off, so switching it doesn't recompile every material.

import { MathUtils, type PerspectiveCamera, type Scene, SpotLight, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import { defOf, type Item } from '../core/items.ts';
import { DEFAULT_TORCH } from '../core/mood.ts';
import type { Sky } from '../core/sky.ts';
import type { HeldItems } from './hands.ts';
import { installNearFieldFalloff } from './lightFalloff.ts';

/**
 * Candela, for the default look (exposure 3, core/mood.ts). three.js (0.186, lights_pars_begin and
 * lights_lambert_pars_fragment) shades a Lambert surface at distance d from a spot light with a cut-off
 * distance R (the item's `radius`, 20 m) as
 *   radiance = I * cos(angle of incidence) * falloff(d) * (1 - (d / R)^4)^2 * albedo / pi
 * (no extra pi on the intensity: it is candela), and OutputPass multiplies that by the exposure. three's
 * falloff is 1 / d^DECAY; render/lightFalloff.ts makes it 1 / (d + d0)^DECAY with d0 = NEAR_FIELD_M, so
 * close surfaces stop brightening while the reach stays.
 *
 * How I and d0 were chosen (DECAY = 1, exposure 3, beam centre, w = the window term):
 *   - a mid-grey (albedo 0.5) at 10 m should be about 0.15, what 3.5 cd with a plain 1 / d gave and the
 *     operator found adequate at range: I / (10 + d0) * w(10) * 0.5 / pi * 3 = 0.15 with w(10) = 0.879,
 *     so I = 0.357 * (10 + d0);
 *   - a white block (albedo 0.9) at 1 m should stay just under white (1): I / (1 + d0) * 0.9 / pi * 3 <= 0.9,
 *     so I <= 1.047 * (1 + d0).
 *   Both hold from d0 = 3.7 up. d0 = 4 gives I = 5.0 (0.357 * 14); 5 cd is used.
 *
 * Values after exposure (white is 1), I = 5, d0 = 4:
 *               albedo 0.5                     albedo 0.9
 *   d = 0.5 m   5 / 4.5 * 1.000 * 0.5 / pi * 3 = 0.53    ... * 0.9 / pi * 3 = 0.96
 *   d = 1 m     5 / 5   * 1.000 * ...          = 0.48    0.86
 *   d = 2 m     5 / 6   * 1.000 * ...          = 0.40    0.72
 *   d = 3 m     5 / 7   * 0.999 * ...          = 0.34    0.61
 *   d = 10 m    5 / 14  * 0.879 * ...          = 0.15    0.27
 * Close surfaces vary by under 2x between 0.5 m and 2 m (plain 1 / d: 4x), and stay under the bloom clip
 * and the ACES shoulder, which skews a bright warm colour towards orange from about 2. Set by eye on
 * 2026-10-01: 3.5 cd with a plain 1 / d was too bright close up, and torch=0.41 on it (1.44 cd) was right
 * there but too weak at 10 m, hence the capped falloff. The earlier 40 cd with a decay of 1.5 gave 6.8 at
 * 2 m for albedo 0.5.
 */
export const FLASHLIGHT_INTENSITY = 5;
export const FLASHLIGHT_DECAY = 1;
const PENUMBRA = 0.35;

/** Sun plus ambient intensity at which the beam is at half strength. */
const HALF_BRIGHTNESS = 0.9;
/** How sharply the beam fades around `HALF_BRIGHTNESS`; high enough that night stays ~1 and noon is negligible. */
const FADE_SHARPNESS = 5;

/**
 * The share of the beam's strength to keep, in (0, 1]: about 1 by night, a few percent of
 * the sun's contribution at noon, partial at dusk and dawn. It approximates eye adaptation:
 * a flashlight pool vanishes in daylight although its output is the same. It keys off the
 * outdoor sky light (sun/moon plus ambient intensity, so overcast or moonlit variants follow),
 * multiplied by local voxel sky visibility where an authored cellar provides it. Elsewhere
 * the existing outdoor approximation remains.
 */
export const flashlightDaylightScale = (
  sky: Pick<Sky, 'lightIntensity' | 'ambientIntensity'>,
  visibility = 1,
): number => {
  const brightness = (sky.lightIntensity + sky.ambientIntensity) * visibility;
  return 1 / (1 + (brightness / HALF_BRIGHTNESS) ** FADE_SHARPNESS);
};

/** Shadow map side in texels; the beam's range and angle bound what it has to cover. */
const SHADOW_MAP_SIZE = 512;
/** Shadow-map depth is perspective, so this is a small fraction of the depth range (about 5 cm at 10 m). */
const SHADOW_BIAS = -0.0001;
/** Metres along the surface normal; a fraction of a 0.5 m block. */
const SHADOW_NORMAL_BIAS = 0.03;
/** Blur radius in shadow-map texels (PCF taps). */
const SHADOW_RADIUS = 2;
/** The lens sits just ahead of the eye, so the map starts close in. */
const SHADOW_NEAR = 0.1;
/** Candela below which the beam is too faint (full daylight) to be worth a shadow map; about 1.4% of the night intensity. */
const MIN_SHADOW_INTENSITY = 0.07;

/** Whether the beam draws a shadow map: shadows allowed, and a beam that is on and bright enough to show. */
export const flashlightCastsShadow = (allowed: boolean, intensity: number): boolean =>
  allowed && intensity > MIN_SHADOW_INTENSITY;

export class Flashlight {
  readonly light = new SpotLight(0xff_f1_d8, 0, 20, Math.PI / 12, PENUMBRA, FLASHLIGHT_DECAY);
  private readonly at = new Vector3();
  private readonly ahead = new Vector3();

  constructor(scene: Scene) {
    // Before any material compiles; the light chunk is shared by all of them.
    installNearFieldFalloff();
    const { shadow } = this.light;
    shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    shadow.camera.near = SHADOW_NEAR;
    shadow.bias = SHADOW_BIAS;
    shadow.normalBias = SHADOW_NORMAL_BIAS;
    shadow.radius = SHADOW_RADIUS;
    scene.add(this.light, this.light.target);
  }

  /** `flashlightDaylightScale` of the sky being drawn; set it each frame before `update`. */
  daylightScale = 1;

  /** Multiplier on the beam's intensity, 1 by default; the debug controls change it to tune the beam by eye. */
  strength = DEFAULT_TORCH;

  /**
   * Whether the beam may cast shadows (the setting; set it each frame before `update`). A light only
   * draws a map while it is on and bright enough, and the light's `castShadow` follows that, so an off
   * torch costs no depth pass and no shadow lookups; each of the two states is a shader variant that
   * `Shadows.warmUp` compiles, so switching between them doesn't stall.
   */
  shadowsAllowed = false;

  /** Points the beam of the light that's on, or turns it off. Call after `held.update`. */
  update(registry: Registry, lit: Item | undefined, held: HeldItems, camera: PerspectiveCamera): void {
    const def = lit && defOf(registry, lit.type).light;
    if (!(lit?.on && def && held.lensOf(lit, camera, this.at))) {
      this.light.intensity = 0;
      this.light.castShadow = false;
      return;
    }
    this.light.intensity = FLASHLIGHT_INTENSITY * this.daylightScale * this.strength;
    this.light.castShadow = flashlightCastsShadow(this.shadowsAllowed, this.light.intensity);
    this.light.distance = def.radius;
    this.light.angle = MathUtils.degToRad((def.beam ?? 120) / 2);
    this.light.position.copy(this.at);
    camera.getWorldDirection(this.ahead);
    this.light.target.position.copy(this.at).addScaledVector(this.ahead, 10);
    this.light.target.updateMatrixWorld();
  }
}
