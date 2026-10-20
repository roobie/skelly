// Keep the light and its shader installed through warm-up; on/off and content spill
// changes then update light properties and uniforms without recompiling materials.

import { MathUtils, type PerspectiveCamera, type Scene, SpotLight, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { lightExposureFor } from '../core/lights.ts';
import { DEFAULT_TORCH } from '../core/mood.ts';
import type { BeamSpill } from '../core/schema.ts';
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

/** The `torchspill` URL parameter as the constructor's switch: `1` true, `0` false, anything else follows content. */
export const spillSwitchFromSearch = (search: string): boolean | undefined => {
  const value = new URLSearchParams(search).get('torchspill');
  if (value === '1' || value === '0') {
    return value === '1';
  }
  return undefined;
};

export class Flashlight {
  readonly light = new SpotLight(undefined, 0);
  readonly lights: readonly SpotLight[];
  private readonly at = new Vector3();
  private readonly ahead = new Vector3();

  private readonly spillOverride: boolean | undefined;
  /** `spillOverride` is the render-only comparison switch: true enables present spill, false forces the plain cone, undefined follows content. */
  constructor(scene: Scene, beamLimit: number, spillOverride?: boolean) {
    this.spillOverride = spillOverride;
    // Before any material compiles; the light chunk is shared by all of them.
    installNearFieldFalloff();
    if (spillOverride !== false) {
      installFlashlightSpill(beamLimit);
    }
    this.lights = Array.from({ length: beamLimit }, (_, index) =>
      index === 0 ? this.light : new SpotLight(undefined, 0),
    );
    for (const light of this.lights) {
      const { shadow } = light;
      shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
      shadow.camera.near = SHADOW_NEAR;
      shadow.bias = SHADOW_BIAS;
      shadow.normalBias = SHADOW_NORMAL_BIAS;
      shadow.radius = SHADOW_RADIUS;
      scene.add(light, light.target);
    }
  }

  dispose(): void {
    for (const light of this.lights) {
      light.removeFromParent();
      light.target.removeFromParent();
      light.shadow.dispose();
    }
  }

  /** Outdoor fallback only; Skylight applies daylight suppression at each receiver when available. */
  daylightScale = 1;

  /** Multiplier on the beam's intensity, 1 by default; the debug controls change it to tune the beam by eye. */
  strength = DEFAULT_TORCH;

  /**
   * Whether the beam may cast shadows (the setting; set it each frame before `update`). A light only
   * draws a map while it is on and bright enough, and the light's `castShadow` follows that, so an off
   * torch costs no depth pass and no shadow lookups. Warm every casting count to avoid switch-on stalls.
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
    const sources = [...inventory.carriedTree()]
      .filter(
        ({ item, location, path }) =>
          defOf(registry, item.type).light?.beam !== undefined &&
          lightExposureFor(registry, item, location, path) === 'carried' &&
          (held.lensOf(item, this.at) || (location.kind === 'worn' && location.slot === 'head')),
      )
      .sort(
        (a, b) =>
          Number(b.item === lit) - Number(a.item === lit) ||
          Number(b.location.kind === 'worn') - Number(a.location.kind === 'worn'),
      );
    const profiles = new Map<SpotLight, BeamSpill | undefined>();
    for (const [index, light] of this.lights.entries()) {
      const source = sources[index];
      if (!source) {
        light.intensity = 0;
        light.castShadow = false;
        continue;
      }
      const def = defOf(registry, source.item.type).light!;
      const beam = def.beam!;
      if (!held.lensOf(source.item, this.at)) {
        this.at.copy(camera.position);
      }
      light.color.set(def.color);
      light.intensity = def.intensity * this.daylightScale * this.strength;
      light.castShadow = flashlightCastsShadow(this.shadowsAllowed, light.intensity);
      light.distance = def.radius;
      const angle = MathUtils.degToRad(beam.angleDegrees / 2);
      const authored = beam.spill;
      const spill =
        this.spillOverride === false || !authored || !(this.spillOverride ?? authored.enabled) ? undefined : authored;
      profiles.set(light, spill);
      light.shadow.focus = spill ? spillHalfAngle(angle, spill) / angle : 1;
      light.decay = beam.decay;
      light.angle = angle;
      light.penumbra = beam.penumbra;
      light.position.copy(this.at);
      camera.getWorldDirection(this.ahead);
      light.target.position.copy(this.at).addScaledVector(this.ahead, 10);
      light.target.updateMatrixWorld();
    }
    if (this.spillOverride !== false) {
      // WebGLLights sorts shadow-casting spots first, preserving scene order within each partition.
      setFlashlightSpill(
        [...this.lights]
          .sort((a, b) => Number(b.castShadow) - Number(a.castShadow))
          .map((light) => profiles.get(light)),
      );
    }
  }
}
