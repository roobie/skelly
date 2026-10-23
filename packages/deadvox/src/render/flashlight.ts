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
import { FIRST_PERSON_SHOULDER } from './playerFigure.ts';

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
   * Whether the beams cast shadows (the setting; set it each frame before `update`). Every beam's
   * `castShadow` follows the setting alone, never on/off or brightness: the casting count is part of
   * every lit program's key, so switching a beam would rebuild the programs of every material not
   * warmed for that count, stalling the frame. Shadows.ts skips the depth pass of a beam that is off or too faint.
   */
  shadowsAllowed = false;

  private aim(item: Item, wornMount: boolean, held: HeldItems, camera: PerspectiveCamera): void {
    if (wornMount) {
      // Slung guns have no first-person model; use the body's shoulder, not the eye or held lens.
      this.at
        .set(...FIRST_PERSON_SHOULDER.right)
        .applyQuaternion(camera.quaternion)
        .add(camera.position);
      this.ahead.set(0, -1, 0);
      return;
    }
    if (!held.lensOf(item, this.at)) {
      this.at.copy(camera.position);
    }
    camera.getWorldDirection(this.ahead);
  }

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
          (held.lensOf(item, this.at) ||
            (location.kind === 'worn' && location.slot === 'head') ||
            (location.kind === 'slot' && path.startsWith('inventory.worn.'))),
      )
      .sort(
        (a, b) =>
          Number(b.item === lit) - Number(a.item === lit) ||
          Number(b.location.kind === 'worn') - Number(a.location.kind === 'worn'),
      );
    const profiles: (BeamSpill | undefined)[] = [];
    for (const [index, light] of this.lights.entries()) {
      light.castShadow = this.shadowsAllowed;
      const source = sources[index];
      if (!source) {
        light.intensity = 0;
        continue;
      }
      const def = defOf(registry, source.item.type).light!;
      const beam = def.beam!;
      const wornMount = source.location.kind === 'slot' && source.path.startsWith('inventory.worn.');
      this.aim(source.item, wornMount, held, camera);
      light.color.set(def.color);
      light.intensity = def.intensity * this.daylightScale * this.strength;
      light.distance = def.radius;
      const angle = MathUtils.degToRad(beam.angleDegrees / 2);
      const authored = beam.spill;
      const spill =
        this.spillOverride === false || !authored || !(this.spillOverride ?? authored.enabled) ? undefined : authored;
      profiles[index] = spill;
      light.shadow.focus = spill ? spillHalfAngle(angle, spill) / angle : 1;
      light.decay = beam.decay;
      light.angle = angle;
      light.penumbra = beam.penumbra;
      light.position.copy(this.at);
      light.target.position.copy(this.at).addScaledVector(this.ahead, 10);
      light.target.updateMatrixWorld();
    }
    if (this.spillOverride !== false) {
      // WebGLLights sorts shadow-casting spots first; every beam casts alike, so its uniforms keep scene order.
      setFlashlightSpill(this.lights.map((_, index) => profiles[index]));
    }
  }
}
