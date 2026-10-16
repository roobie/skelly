// The beam stays in the scene with zero intensity while off, so switching it
// doesn't recompile every material.

import { MathUtils, Mesh, type PerspectiveCamera, type Scene, SpotLight, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { DEFAULT_TORCH } from '../core/mood.ts';
import type { Sky } from '../core/sky.ts';
import { installFlashlightSpill, setFlashlightSpill, spillHalfAngle } from './flashlightCone.ts';
import type { HeldItems } from './hands.ts';
import { installNearFieldFalloff } from './lightFalloff.ts';

/** Sun plus ambient intensity at which the beam is at half strength. */
export const HALF_BRIGHTNESS = 0.9;
/** How sharply the beam fades around `HALF_BRIGHTNESS`; high enough that night stays ~1 and noon is negligible. */
export const FADE_SHARPNESS = 5;

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
  // Colour, range and beam shape come from the lit item's content in `update`.
  readonly light = new SpotLight(undefined, 0);
  private readonly at = new Vector3();
  private readonly ahead = new Vector3();

  private readonly spill: boolean;
  private readonly materialKeys = new WeakMap<object, () => string>();

  private readonly scene: Scene;

  constructor(scene: Scene, spill = true) {
    this.scene = scene;
    this.spill = spill;
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

  /** Outdoor fallback only; Skylight applies daylight suppression at each receiver when available. */
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
  update({
    registry,
    lit,
    held,
    camera,
    inventory,
  }: {
    registry: Registry;
    lit: Item | undefined;
    held: HeldItems;
    camera: PerspectiveCamera;
    inventory: Inventory;
  }): void {
    const def = lit && defOf(registry, lit.type).light;
    const hasHeldLens = lit ? held.lensOf(lit, this.at) : false;
    const location = lit ? inventory.locate(lit) : undefined;
    const headMounted = location?.kind === 'worn' && location.slot === 'head';
    if (!(lit?.on && def?.beam !== undefined && (hasHeldLens || headMounted))) {
      this.light.intensity = 0;
      this.light.castShadow = false;
      return;
    }
    if (!hasHeldLens) {
      this.at.copy(camera.position);
    }
    this.light.color.set(def.color);
    this.light.intensity = def.intensity * this.daylightScale * this.strength;
    this.light.castShadow = flashlightCastsShadow(this.shadowsAllowed, this.light.intensity);
    this.light.distance = def.radius;
    const angle = MathUtils.degToRad(def.beam.angleDegrees / 2);
    const spill = this.spill ? def.beam.spill : undefined;
    if (installFlashlightSpill(spill !== undefined)) {
      // Changing presence needs a plain/spill shader variant; profile edits only update uniforms.
      this.scene.traverse((object) => {
        if (object instanceof Mesh) {
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            const originalKey: () => string =
              this.materialKeys.get(material) ?? material.customProgramCacheKey.bind(material);
            this.materialKeys.set(material, originalKey);
            material.customProgramCacheKey = () => `${originalKey()}:flashlight-spill:${spill !== undefined}`;
            material.needsUpdate = true;
          }
        }
      });
    }
    if (spill) {
      setFlashlightSpill(spill);
    }
    this.light.shadow.focus = spill ? spillHalfAngle(angle, spill) / angle : 1;
    this.light.decay = def.beam.decay;
    this.light.angle = angle;
    this.light.penumbra = def.beam.penumbra;
    this.light.position.copy(this.at);
    camera.getWorldDirection(this.ahead);
    this.light.target.position.copy(this.at).addScaledVector(this.ahead, 10);
    this.light.target.updateMatrixWorld();
  }
}
