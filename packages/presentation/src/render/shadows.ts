// Shadows from the sun, flashlight and item lamps, on three.js's own shadow maps.
//
// The sun's map is one orthographic camera that follows the player and covers `distance` metres
// each way (CSM would need its own material patch, which fights the chunk material's, so cascades
// are not used). Its centre snaps to the map's texel grid in light space so shadow edges don't
// shimmer as the player walks. Only the shadow casters inside that box are drawn into it.
//
// Culling chunks to the camera would drop the ones behind you that shade what is in front. So this
// takes over `renderer.shadowMap.render`: it picks the casters itself (chunks.ts
// `selectShadowCasters`, and the crowd figures through mobActors.ts `selectShadowCasters`, whose
// bone-placed instances no frustum can cull) and draws one map per light through it; the chunk batch
// draws each pass's own set (chunkBatch.ts), so the main pass keeps the camera's chunks. A light's `castShadow` stays true while its setting is on, so the hour
// doesn't change shader programs. The sun's shadow is full whenever its light shines, the moon's
// light at night included (core/sky.ts `sunShadowStrength` says why); with the light out it sets
// `shadow.intensity` to 0 and stops redrawing its map (but a casting light with no map yet always gets
// one allocated by three's pass, `needsMap`). The flashlight's beams likewise keep `castShadow` with
// the setting whether on or off (flashlight.ts, `shadowsAllowed`), and a beam's map is drawn only
// while it is bright enough to show (`beamMapDue`); otherwise its `shadow.intensity` is 0, so the
// map it stopped refreshing shades nothing.
//
// The sun's map needs both chunk face orientations. Front faces stop PCF taps reaching behind a
// joined solid at interior corners (#562). Back faces still block a buried room when the solid's
// sun-facing entry surface lies outside the bounded map. `sunShadowBias` offsets lookups past the
// PCF disk so a lit face never compares against its own depth. The flashlight keeps the back faces: its light
// sits with the viewer, so a face it can't reach is one the viewer can't see, and its perspective
// texels grow with distance past what a fixed normal offset could clear.
//
// The held scene (hands.ts) shares the sun map drawn by the world pass; drawing maps again for it would add
// another per-frame shadow pass. Its item point-light copies also share the world's maps. The player's world
// figure is on its own layer (shadowFlags.ts): held-source passes exclude their holder, dropped lamps include them.

import { SHADOW_DISTANCE_RANGE, type ShadowState } from '@skelly/engine/look';
import {
  BackSide,
  type Box3,
  type Camera,
  type DirectionalLight,
  DoubleSide,
  type Frustum,
  type Light,
  type Material,
  Mesh,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  type PointLight,
  type Scene,
  type Side,
  type SpotLight,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { ChunkMeshes } from './chunks.ts';
import { ItemShadowCache } from './itemShadowCache.ts';
import { OPTIC_BODY_LAYER, PLAYER_FIGURE_LAYER, PLAYER_SELF_MASK_LAYER, SHADOW_CROWD_LAYER } from './shadowFlags.ts';

/** Side of the sun's shadow map in texels: 2048² is 16 MB of depth, which Iris Xe copes with. */
export const SUN_MAP_SIZE = 2048;
/** The sun's box reaches this many shadow distances towards the sun (tall things off to its side still cast) and away from it. */
const BOX_TOWARDS_SUN = 2;
const BOX_AWAY_FROM_SUN = 1.5;
// Wider PCF footprint hides texel crawl as the sun rotates without changing sampling cost.
const SUN_SHADOW_RADIUS = 4;
/** Frames between redraws of the sun's map while nothing it shows has changed (animated actors still move). */
export const IDLE_REFRESH_EVERY = 2;

export const sunShadowTexelSize = (distance: number, mapSize = SUN_MAP_SIZE): number => (2 * distance) / mapSize;

export interface ShadowBias {
  /** Added to the depth, as a fraction of the box's depth span; negative pulls the occluder away from the receiver. */
  bias: number;
  normalBias: number;
}

/**
 * Biases for the sun's map at `distance` metres: a texel of depth, and along the surface normal the PCF
 * disk's reach, its radius plus the texel the hardware compare blends in. The map holds the faces that face
 * the sun (see the header), so a lit face is in it; a shorter offset lets the disk's sunward taps find that
 * face in front of the lookup and speckle it. Both scale with the texel size, so they stay a similar share of
 * a 0.5 m block at any distance.
 */
export const sunShadowBias = (distance: number, mapSize = SUN_MAP_SIZE): ShadowBias => {
  const texel = sunShadowTexelSize(distance, mapSize);
  const span = (BOX_TOWARDS_SUN + BOX_AWAY_FROM_SUN) * distance;
  return { bias: -texel / span, normalBias: (SUN_SHADOW_RADIUS + 1) * texel };
};

const right = new Vector3();
const up = new Vector3();

/**
 * `center` moved to the nearest point on the grid of `texel`-sized cells in the plane the sun's camera
 * looks across (`toSun` is the unit vector towards the sun). The camera looks along −`toSun` with +y
 * up, as three.js's `lookAt` builds it. Distance along the light is left alone. Writes to and returns `out`.
 */
export const snapToTexels = (center: Vector3, toSun: Vector3, texel: number, out = new Vector3()): Vector3 => {
  right.set(0, 1, 0).cross(toSun).normalize();
  up.copy(toSun).cross(right);
  const x = center.dot(right);
  const y = center.dot(up);
  return out
    .copy(center)
    .addScaledVector(right, Math.round(x / texel) * texel - x)
    .addScaledVector(up, Math.round(y / texel) * texel - y);
};

/** Whether the sun's map must be drawn this frame: what it shows changed, or the idle refresh has come round. */
export const sunMapDue = (changed: boolean, framesSinceDraw: number): boolean =>
  changed || framesSinceDraw >= IDLE_REFRESH_EVERY;

/** Candela below which a beam is too faint (off, or full daylight) to be worth a shadow map; about 1.4% of the night intensity. */
const MIN_BEAM_SHADOW_INTENSITY = 0.07;

/** Whether a casting beam's map is drawn this frame: it is on and bright enough to show. */
export const beamMapDue = (intensity: number): boolean => intensity > MIN_BEAM_SHADOW_INTENSITY;

/** Casters for a light with a frustum: the boxes that meet it. */
export const inFrustum =
  (frustum: Frustum) =>
  (box: Box3): boolean =>
    frustum.intersectsBox(box);

/** Casters for a light with a range: the boxes within `radius` metres of it. */
export const withinRange =
  (at: Vector3, radius: number) =>
  (box: Box3): boolean =>
    box.distanceToPoint(at) <= radius;

/** Caster filter that picks nothing. */
const noBoxes = (): boolean => false;

/**
 * Whether `light` casts but has no shadow map yet. three.js allocates the map (a depth texture with a compare
 * function, which `sampler2DShadow` needs) only inside its own `shadowMap.render`, so every such light must go
 * through it before the main pass, whether or not we want its map redrawn this frame.
 */
export const needsMap = (light: { castShadow: boolean; shadow: { map: unknown } }): boolean =>
  light.castShadow && light.shadow.map === null;

type DrawMaps = (lights: Light[], scene: Scene, camera: Camera) => void;

/** A renderer whose instanced casters must be picked per light, as ChunkMeshes picks its boxes: the
 * crowd figures (render/mobActors.ts), whose bone-placed instances no frustum can cull. One slot per
 * light that casts within a renderer frame (the sun plus every torch), because three uploads a
 * geometry's attributes only once per renderer frame — passes sharing one selection would all draw
 * whichever rows reached the GPU first. */
export interface CrowdCasters {
  reserveShadowSlots: (slots: number) => void;
  shadowInputs: (casts: (box: Box3) => boolean) => readonly unknown[];
  selectShadowCasters: (slot: number, casts: (box: Box3) => boolean) => void;
}

export class Shadows {
  private readonly scene: Scene;
  private readonly light: DirectionalLight;
  /** Holds the sun and its target, so moving it moves the shadow box without changing the light's direction. */
  private readonly rig: Object3D;
  private readonly meshes: ChunkMeshes;
  private crowds: readonly CrowdCasters[] = [];
  private state: ShadowState = { sun: false, torch: false, distance: SHADOW_DISTANCE_RANGE.min };
  private torches: readonly SpotLight[] = [];
  private items: readonly PointLight[] = [];
  private itemBodies: () => readonly ({ visible: boolean } | undefined)[] = () => [];
  private readonly itemView = new PerspectiveCamera();
  private readonly itemCache = new ItemShadowCache();
  /** The last frame's item-lamp pass, for the debug readout: which slots redrew, and at what CPU cost. */
  readonly itemStats = { cpuRealMs: 0, faces: 0, active: 0, redraws: [] as number[] };
  /** What the flashlight's pass looks through: layer 0 plus the shadow crowd, so the player's figure
   * (layer 1) is left out while the selected crowd figures still cast. */
  private readonly torchView = new PerspectiveCamera();
  private strength = 0;
  private sunDue = false;
  private stale = true;
  private sinceDraw = 0;
  private readonly drawnAt = new Vector3();
  private readonly drawnToSun = new Vector3();
  private drawnVersion = -1;
  private readonly toSun = new Vector3();
  private readonly snapped = new Vector3();
  private sunCasters = 0;
  private torchCasters = 0;
  private smallSunMapValue = false;

  /** `sun` is the scene's directional light and the group holding it and its target (engine.ts). */
  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    sun: { light: DirectionalLight; rig: Object3D },
    meshes: ChunkMeshes,
  ) {
    const { light, rig } = sun;
    this.scene = scene;
    this.light = light;
    this.rig = rig;
    this.meshes = meshes;
    this.itemView.layers.enable(SHADOW_CROWD_LAYER);
    this.itemView.layers.enable(OPTIC_BODY_LAYER);
    // Enabled for good: programs only contain shadow code while a light casts, and toggling this at
    // runtime would not rebuild them. With nothing casting (the benchmark) it changes nothing.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    light.shadow.mapSize.set(SUN_MAP_SIZE, SUN_MAP_SIZE);
    light.shadow.radius = SUN_SHADOW_RADIUS;
    this.configureSun();
    const { shadowMap } = renderer;
    const draw: DrawMaps = shadowMap.render.bind(shadowMap);
    shadowMap.render = (_lights, drawnScene, camera) => this.drawMaps(draw, drawnScene, camera);
    this.torchView.layers.enable(SHADOW_CROWD_LAYER);
  }

  get sunOn(): boolean {
    return this.state.sun;
  }

  get torchOn(): boolean {
    return this.state.torch;
  }

  get smallSunMap(): boolean {
    return this.smallSunMapValue;
  }

  setSmallSunMap(on: boolean): void {
    if (on === this.smallSunMapValue) {
      return;
    }
    this.smallSunMapValue = on;
    const size = on ? SUN_MAP_SIZE / 2 : SUN_MAP_SIZE;
    this.light.shadow.map?.dispose();
    this.light.shadow.map = null;
    this.light.shadow.mapSize.set(size, size);
    this.configureSun();
  }

  get distance(): number {
    return this.state.distance;
  }

  get settings(): ShadowState {
    return { ...this.state };
  }

  /** How strong the sun's shadows were last frame, in [0, 1] (0 with its light out). */
  get sunStrength(): number {
    return this.strength;
  }

  /** Chunk meshes that cast into the sun's and the flashlight's map in the last pass drawn. */
  get casters(): { sun: number; torch: number } {
    return { sun: this.sunCasters, torch: this.torchCasters };
  }

  attachTorches(lights: readonly SpotLight[]): void {
    this.torches = lights;
    this.reserveCrowdSlots();
  }

  attachItems(
    lights: readonly PointLight[],
    bodies: () => readonly ({ visible: boolean } | undefined)[],
    tuning: { faceSize: number; bias: number; normalBiasMetres: number; radius: number; nearMetres: number },
  ): void {
    this.items = lights;
    this.itemBodies = bodies;
    for (const light of lights) {
      light.castShadow = true;
      light.shadow.mapSize.set(tuning.faceSize, tuning.faceSize);
      light.shadow.bias = tuning.bias;
      light.shadow.normalBias = tuning.normalBiasMetres;
      light.shadow.radius = tuning.radius;
      light.shadow.camera.near = tuning.nearMetres;
    }
    this.reserveCrowdSlots();
  }

  /** Adds a crowd whose figures the passes pick per light (see CrowdCasters); call before the first render. */
  attachCrowd(crowd: CrowdCasters): void {
    this.crowds = [...this.crowds, crowd];
    this.reserveCrowdSlots();
  }

  /** Every caster selection needs its own upload slot for the renderer frame. */
  private reserveCrowdSlots(): void {
    for (const crowd of this.crowds) {
      crowd.reserveShadowSlots(1 + this.torches.length + this.items.length);
    }
  }

  /** Takes a whole state, as read from the defaults or the URL. Turning a light's shadows on or off rebuilds the programs once. */
  restore(state: ShadowState): void {
    this.state = { ...state };
    this.configureSun();
  }

  setSun(on: boolean): void {
    this.restore({ ...this.state, sun: on });
  }

  setTorch(on: boolean): void {
    this.restore({ ...this.state, torch: on });
  }

  setDistance(metres: number): void {
    this.restore({ ...this.state, distance: metres });
  }

  /**
   * Sets the sun's shadows to `strength` (core/sky.ts `sunShadowStrength`), puts its box on the player
   * and decides whether the map is redrawn this frame. Call after `applySky` and before rendering.
   * The map is redrawn when the box moved by a texel, the sun turned, a chunk changed or the
   * distance did (all of which make the old map wrong), and otherwise every `IDLE_REFRESH_EVERY` frames,
   * which keeps animated actors and the figure current while halving the cost of standing still.
   */
  update(strength: number, center: Vector3): void {
    const { light, rig, meshes } = this;
    this.strength = strength;
    light.shadow.intensity = strength;
    if (!(this.state.sun && strength > 0)) {
      this.sunDue = false;
      this.stale = true;
      return;
    }
    this.toSun.copy(light.position).normalize();
    snapToTexels(center, this.toSun, sunShadowTexelSize(this.state.distance, light.shadow.mapSize.x), this.snapped);
    rig.position.copy(this.snapped);
    rig.updateMatrixWorld(true);
    const changed =
      this.stale ||
      !this.snapped.equals(this.drawnAt) ||
      this.toSun.distanceToSquared(this.drawnToSun) > 1e-8 ||
      meshes.version !== this.drawnVersion;
    this.sinceDraw += 1;
    this.sunDue = sunMapDue(changed, this.sinceDraw);
  }

  warmUp(
    mood: { warmUp: (scenes: readonly { scene: Scene; camera: Camera }[]) => Promise<unknown> },
    targets: readonly { scene: Scene; camera: Camera }[],
  ): Promise<unknown> {
    // Compile for the casting state the beams will draw in, which may precede the flashlight's first update.
    for (const torch of this.torches) {
      torch.castShadow = this.state.torch;
    }
    return mood.warmUp(targets);
  }

  warmUpCasters(compile: (scene: Scene, camera: Camera, point: boolean) => Promise<unknown>): Promise<unknown> {
    const compiling: Promise<unknown>[] = [];
    this.drawMaps(
      (lights, scene, camera) => {
        compiling.push(
          compile(
            scene,
            camera,
            lights.some((light) => 'isPointLight' in light),
          ),
        );
      },
      this.scene,
      this.torchView,
    );
    this.stale = true;
    this.sunDue = true;
    return Promise.all(compiling);
  }

  /** Sets the sun's box, biases and cast flag from the state, and marks its map stale. */
  private configureSun(): void {
    const { light } = this;
    const { distance, sun } = this.state;
    const { camera } = light.shadow;
    camera.left = -distance;
    camera.right = distance;
    camera.top = distance;
    camera.bottom = -distance;
    // Negative near: the camera sits a metre from the box's centre, with the box reaching behind it towards the sun.
    camera.near = -BOX_TOWARDS_SUN * distance;
    camera.far = BOX_AWAY_FROM_SUN * distance;
    camera.updateProjectionMatrix();
    Object.assign(light.shadow, sunShadowBias(distance, light.shadow.mapSize.x));
    light.castShadow = sun;
    this.stale = true;
  }

  /** Picks one light's casters into `slot`'s selection: the chunk boxes and every attached crowd's
   * figures. Returns the chunk count. */
  private selectCasters(slot: number, casts: (box: Box3) => boolean, side: Side): number {
    const chunks = this.meshes.selectShadowCasters(casts, side);
    for (const crowd of this.crowds) {
      crowd.selectShadowCasters(slot, casts);
    }
    return chunks;
  }

  private drawMaps(draw: DrawMaps, scene: Scene, camera: Camera): void {
    // The held scene samples the world's existing sun map; its render must not draw shadow maps again.
    if (scene !== this.scene) {
      return;
    }
    const { light, torches, meshes } = this;
    const sunDraw = (): void => {
      const { mask } = camera.layers;
      camera.layers.enable(PLAYER_FIGURE_LAYER);
      camera.layers.enable(PLAYER_SELF_MASK_LAYER);
      camera.layers.enable(OPTIC_BODY_LAYER);
      camera.layers.enable(SHADOW_CROWD_LAYER);
      try {
        draw([light], scene, camera);
      } finally {
        camera.layers.mask = mask;
      }
    };
    if (!this.sunDue && needsMap(light)) {
      // A casting light whose map three.js hasn't allocated yet (its light out, or sun shadows just switched on):
      // its programs would bind three's placeholder, which GL rejects against a sampler2DShadow in the
      // `sampler2DShadow[]` uniform path (WebGLUniforms.js setValueT1Array). Let three's own pass allocate and
      // clear it, with no casters, so it reads as fully lit; `stale` stays set so the first real draw follows.
      this.sunCasters = this.selectCasters(0, noBoxes, DoubleSide);
      sunDraw();
    }
    if (this.sunDue) {
      light.shadow.updateMatrices(light);
      this.sunCasters = this.selectCasters(0, inFrustum(light.shadow.getFrustum()), DoubleSide);
      sunDraw();
      this.drawnAt.copy(this.snapped);
      this.drawnToSun.copy(this.toSun);
      this.drawnVersion = meshes.version;
      this.stale = false;
      this.sinceDraw = 0;
      this.sunDue = false;
    }
    this.torchCasters = 0;
    for (const [index, torch] of torches.entries()) {
      const slot = index + 1; // slot 0 is the sun's
      const due = torch.castShadow && beamMapDue(torch.intensity);
      // A faint beam still lights receivers, which sample its map; a map it no longer refreshes would cast
      // stale shadows, so it shades nothing until it is redrawn. three.js reads this after this pass.
      torch.shadow.intensity = due ? 1 : 0;
      if (due) {
        this.torchCasters += this.selectCasters(slot, withinRange(torch.position, torch.distance), BackSide);
        draw([torch], scene, this.torchView);
      } else if (needsMap(torch)) {
        // An off beam still casts, so its programs sample a map; allocate it empty, as for the sun above.
        this.selectCasters(slot, noBoxes, BackSide);
        draw([torch], scene, this.torchView);
      }
    }
    this.drawItems(draw, scene);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: One synchronous scope restores the scene graph, source visibility and shared material sides together.
  private drawItems(draw: DrawMaps, scene: Scene): void {
    const { meshes, torches } = this;
    if (this.items.length === 0) {
      return;
    }
    const started = performance.now();
    const stats = this.itemStats;
    stats.faces = 0;
    stats.active = 0;
    stats.redraws = this.items.map(() => 0);
    // Dark lamps with their maps already allocated need no caster walk, which visits the whole scene.
    let work = false;
    for (const item of this.items) {
      const active = item.intensity > 0;
      item.shadow.intensity = active ? 1 : 0;
      stats.active += active ? 1 : 0;
      work ||= active || needsMap(item);
    }
    if (!work) {
      stats.cpuRealMs = performance.now() - started;
      return;
    }
    const bodies = this.itemBodies();
    // A remote lamp can illuminate receivers behind a thin door, unlike a viewer-mounted beam.
    // Capture entry faces for every blocker, including model materials, not only terrain.
    const sides = new Map<Material, Side | null>();
    const casters: Mesh[] = [];
    this.scene.traverse((object) => {
      if (!(object instanceof Mesh && object.castShadow)) {
        return;
      }
      casters.push(object);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!sides.has(material)) {
          sides.set(material, material.shadowSide);
        }
        material.shadowSide = DoubleSide;
      }
    });
    // Keep the original objects and world matrices: their hooks and renderer upload identities matter.
    // The shadow renderer only walks children; a flat root avoids visiting noncasters on every face.
    const casterScene = Object.create(scene) as Scene;
    const children = new Map(casters.map((caster) => [caster, caster.children]));
    for (const caster of casters) {
      caster.children = [];
    }
    try {
      for (const [index, item] of this.items.entries()) {
        const active = item.intensity > 0;
        const cold = needsMap(item);
        if (!(active || cold)) {
          continue;
        }
        const slot = 1 + torches.length + index;
        this.selectCasters(slot, active ? withinRange(item.position, item.distance) : noBoxes, DoubleSide);
        // A dropped source must shadow the player; a held source excludes its holder, as the beam does.
        this.itemView.layers.set(0);
        this.itemView.layers.enable(SHADOW_CROWD_LAYER);
        this.itemView.layers.enable(OPTIC_BODY_LAYER);
        if (!item.userData.carried) {
          this.itemView.layers.enable(PLAYER_FIGURE_LAYER);
          this.itemView.layers.enable(PLAYER_SELF_MASK_LAYER);
        }
        // The lamp's own opaque model must not enclose its emitter. Other lamps remain blockers.
        const body = bodies[index];
        const visible = body?.visible;
        if (body) {
          body.visible = false;
        }
        try {
          casterScene.children = casters.filter((caster) => {
            for (let ancestor: Object3D | null = caster; ancestor; ancestor = ancestor.parent) {
              if (!ancestor.visible) {
                return false;
              }
            }
            return true;
          });
          const casts = withinRange(item.position, item.distance);
          const changed =
            !item.userData.carried &&
            this.itemCache.changed(
              index,
              item,
              casterScene.children.filter(
                (caster): caster is Mesh =>
                  caster instanceof Mesh &&
                  caster !== meshes.batch &&
                  caster.layers.test(this.itemView.layers) &&
                  !caster.layers.isEnabled(SHADOW_CROWD_LAYER),
              ),
              [...meshes.shadowInputs(casts), ...this.crowds.flatMap((crowd) => crowd.shadowInputs(casts))],
            );
          item.shadow.autoUpdate = Boolean(item.userData.carried);
          item.shadow.needsUpdate = cold || changed;
          if (!(cold || item.shadow.autoUpdate || item.shadow.needsUpdate)) {
            continue;
          }
          draw([item], casterScene, this.itemView);
          stats.redraws[index] = 1;
        } finally {
          if (body) {
            body.visible = visible!;
          }
        }
        stats.faces += 6;
      }
    } finally {
      for (const [caster, original] of children) {
        caster.children = original;
      }
      for (const [material, side] of sides) {
        material.shadowSide = side;
      }
      stats.cpuRealMs = performance.now() - started;
    }
  }
}
