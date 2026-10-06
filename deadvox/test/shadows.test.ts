import {
  Box3,
  type Camera,
  DirectionalLight,
  Frustum,
  Group,
  type Light,
  Matrix4,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  SpotLight,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import type { MeshData } from '../src/core/mesher.ts';
import { clampShadowDistance, DEFAULT_SHADOWS, nextShadowDistance, SHADOW_DISTANCES } from '../src/core/mood.ts';
import { skyAt, sunDirection, sunShadowStrength } from '../src/core/sky.ts';
import { shadowReadoutText } from '../src/debug/index.ts';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { FLASHLIGHT_INTENSITY, flashlightCastsShadow } from '../src/render/flashlight.ts';
import { FrameTimes } from '../src/render/frameTimes.ts';
import { PLAYER_FIGURE_LAYER } from '../src/render/shadowFlags.ts';
import {
  IDLE_REFRESH_EVERY,
  inFrustum,
  needsMap,
  Shadows,
  SUN_MAP_SIZE,
  snapToTexels,
  sunMapDue,
  sunShadowBias,
  sunShadowTexelSize,
  withinRange,
} from '../src/render/shadows.ts';

const strengthAt = (hour: number): number => sunShadowStrength(sunDirection(hour)[1], skyAt(hour).lightIntensity);

describe('sun shadow strength', () => {
  it('is full through the day, and zero all night, where the light is only a stand-in for a moon', () => {
    for (const hour of [9, 12, 15]) {
      expect(strengthAt(hour)).toBe(1);
    }
    for (const hour of [19, 20, 21, 23, 0, 2, 3.5, 5, 5.9]) {
      expect(strengthAt(hour)).toBe(0);
    }
  });

  it('rises from sunrise at 06:00 and falls to sunset at 18:00, never popping', () => {
    expect(strengthAt(6)).toBe(0);
    expect(strengthAt(18)).toBeCloseTo(0, 6);
    let previous = strengthAt(0);
    let peak = 0;
    for (let minute = 1; minute <= 24 * 60; minute++) {
      const strength = strengthAt((minute / 60) % 24);
      expect(Math.abs(strength - previous)).toBeLessThan(0.04);
      expect(strength).toBeGreaterThanOrEqual(0);
      expect(strength).toBeLessThanOrEqual(1);
      peak = Math.max(peak, strength);
      previous = strength;
    }
    expect(peak).toBe(1);
    expect(strengthAt(6.4)).toBeGreaterThan(0);
    expect(strengthAt(6.4)).toBeLessThan(strengthAt(6.8));
    expect(strengthAt(17.6)).toBeGreaterThan(strengthAt(17.9));
  });

  it('fades with the light itself, so overcast weather weakens shadows and no light has none', () => {
    const [, noon] = sunDirection(12);
    expect(sunShadowStrength(noon, 1.6)).toBe(1);
    expect(sunShadowStrength(noon, 0.4)).toBeLessThan(0.5);
    expect(sunShadowStrength(noon, 0)).toBe(0);
    expect(sunShadowStrength(-0.5, 1.6)).toBe(0);
  });
});

describe('shadow settings', () => {
  it('steps the distance through the allowed list and wraps', () => {
    const cycle = [...SHADOW_DISTANCES, SHADOW_DISTANCES[0]!];
    expect(cycle.slice(0, -1).map(nextShadowDistance)).toEqual(cycle.slice(1));
    expect(nextShadowDistance(SHADOW_DISTANCES.at(-1)!)).toBe(SHADOW_DISTANCES[0]);
  });

  it('clamps a distance to whole metres in 16..96, and a non-number to the default', () => {
    expect([1, 16.4, 33.6, 96, 500].map(clampShadowDistance)).toEqual([16, 16, 34, 96, 96]);
    expect(clampShadowDistance(Number.NaN)).toBe(DEFAULT_SHADOWS.distance);
    expect(DEFAULT_SHADOWS).toMatchObject({ sun: true, torch: true });
  });

  it('draws the flashlight map only for a beam that is allowed, on and bright enough to show', () => {
    expect(flashlightCastsShadow(true, FLASHLIGHT_INTENSITY)).toBe(true);
    expect(flashlightCastsShadow(false, FLASHLIGHT_INTENSITY)).toBe(false);
    expect(flashlightCastsShadow(true, 0)).toBe(false);
    // Full daylight scales the beam to about 0.01 cd (flashlight.ts), not worth a depth pass.
    expect(flashlightCastsShadow(true, 0.01)).toBe(false);
  });

  it('reads the settings and counts out for the debug readout', () => {
    expect(shadowReadoutText({ sun: true, torch: false, distance: 40 }, 0.834, { sun: 56, torch: 0 })).toBe(
      'shadows: sun ON ×0.83 · flashlight OFF · 40 m · chunk casters 56 / 0',
    );
    expect(shadowReadoutText({ sun: false, torch: true, distance: 24 }, 0, { sun: 0, torch: 3 })).toContain('sun OFF');
  });
});

describe('sun shadow biases', () => {
  it('derives bias from the texel footprint and scales it with distance and map resolution', () => {
    const footprint = sunShadowTexelSize(36, 1024);
    expect(sunShadowTexelSize(72, 1024)).toBeCloseTo(footprint * 2, 12);
    expect(sunShadowTexelSize(36, 2048)).toBeCloseTo(footprint / 2, 12);
    const near = sunShadowBias(40);
    expect(near.bias).toBeLessThan(0);
    // Texel 2 × 40 m / 2048 = 3.9 cm; the box's depth span is 3.5 × 40 m.
    expect(-near.bias * 3.5 * 40).toBeCloseTo((2 * 40) / SUN_MAP_SIZE, 6);
    expect(near.normalBias).toBeCloseTo(1.5 * ((2 * 40) / SUN_MAP_SIZE), 6);
    expect(sunShadowBias(64).normalBias).toBeCloseTo(near.normalBias * (64 / 40), 6);
    expect(sunShadowBias(64).bias).toBeCloseTo(near.bias, 9);
  });
});

describe('snapping the sun box to the shadow texel grid', () => {
  const texel = 0.04;
  /** The ortho camera's own right and up axes, from three.js's lookAt. */
  const axes = (direction: Vector3) => {
    const m = new Matrix4().lookAt(direction, new Vector3(), new Vector3(0, 1, 0));
    return { x: new Vector3().setFromMatrixColumn(m, 0), y: new Vector3().setFromMatrixColumn(m, 1) };
  };
  const toSun = new Vector3(0.6, 0.7, -0.3).normalize();

  it('lands on the grid across the light, and leaves the distance along it alone', () => {
    const { x, y } = axes(toSun);
    for (const center of [new Vector3(3.14, 1.7, -8.2), new Vector3(-250.37, 3, 44.4)]) {
      const snapped = snapToTexels(center, toSun, texel);
      for (const axis of [x, y]) {
        const cells = snapped.dot(axis) / texel;
        expect(Math.abs(cells - Math.round(cells))).toBeLessThan(1e-6);
        expect(Math.abs(snapped.dot(axis) - center.dot(axis))).toBeLessThanOrEqual(texel / 2 + 1e-9);
      }
      expect(snapped.dot(toSun)).toBeCloseTo(center.dot(toSun), 9);
    }
  });

  it('holds still for movements smaller than a texel, so shadows do not crawl', () => {
    const { x } = axes(toSun);
    const base = snapToTexels(new Vector3(10, 2, 10), toSun, texel);
    const nudged = snapToTexels(base.clone().addScaledVector(x, texel * 0.4), toSun, texel);
    expect(nudged.distanceTo(base)).toBeLessThan(1e-9);
    const moved = snapToTexels(base.clone().addScaledVector(x, texel * 1.2), toSun, texel);
    expect(moved.distanceTo(base)).toBeCloseTo(texel, 6);
  });
});

describe('redrawing the sun map', () => {
  it('redraws at once when something it shows changed, and otherwise on the idle refresh', () => {
    expect(IDLE_REFRESH_EVERY).toBe(2);
    expect(sunMapDue(true, 0)).toBe(true);
    expect(sunMapDue(false, 1)).toBe(false);
    expect(sunMapDue(false, IDLE_REFRESH_EVERY)).toBe(true);
  });
});

/** One upward face covering a chunk's bottom layer: a flat patch of ground. */
const floor: MeshData = {
  positions: new Float32Array([0, 1, 0, 0, 1, CHUNK, CHUNK, 1, CHUNK, CHUNK, 1, 0]),
  normals: new Int8Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  colors: new Uint8Array(12),
  patterns: new Uint8Array(4),
  occlusion: new Uint8Array(4).fill(255),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
};

describe('choosing shadow casters', () => {
  it('takes the boxes that meet a frustum, or lie within a range of a point', () => {
    const camera = new OrthographicCamera(-5, 5, 5, -5, 0.1, 20);
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld();
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const box = (x: number, z: number) => new Box3(new Vector3(x, 0, z), new Vector3(x + 1, 1, z + 1));
    expect(inFrustum(frustum)(box(0, 0))).toBe(true);
    expect(inFrustum(frustum)(box(8, 0))).toBe(false);
    expect(inFrustum(frustum)(box(0, -30))).toBe(false);
    const near = withinRange(new Vector3(0, 0, 0), 5);
    expect(near(box(3, 0))).toBe(true);
    expect(near(box(5.5, 0))).toBe(false);
  });

  it('makes only the selected chunk meshes cast, shows them for the pass, and lets every chunk receive', () => {
    const meshes = new ChunkMeshes(0.5);
    const versionBefore = meshes.version;
    meshes.set('near', [0, 0, 0], floor);
    meshes.set('far', [400, 0, 0], floor); // 200 m away
    expect(meshes.version).toBeGreaterThan(versionBefore);
    const chunks = meshes.group.children.filter((child) => child.visible);
    expect(chunks.every((child) => child.receiveShadow)).toBe(true);
    expect(chunks).toHaveLength(2);

    // The camera culled both (nothing in view); the shadow pass still gets the one in range.
    meshes.cull(new PerspectiveCamera(75, 1, 0.05, 1));
    const cast = meshes.selectShadowCasters(withinRange(new Vector3(0, 1, 0), 40));
    expect(cast).toBe(1);
    const casting = meshes.group.children.filter((child) => child.castShadow);
    expect(casting.map((child) => child.position.x)).toEqual([0]);
    expect(casting.every((child) => child.visible)).toBe(true);

    const before = meshes.version;
    meshes.remove('far');
    expect(meshes.version).toBeGreaterThan(before);
  });
});

describe('Shadows', () => {
  const setup = () => {
    const draws: { light: Light; seesFigure: boolean }[] = [];
    const figure = new Object3D();
    figure.layers.set(PLAYER_FIGURE_LAYER);
    // Stands in for three.js's own shadow map renderer, which `Shadows` takes over.
    const renderer = {
      shadowMap: {
        enabled: false,
        type: 0,
        render(lights: Light[], _scene: Scene, view: Camera) {
          for (const light of lights) {
            // three.js allocates a casting light's map inside this call.
            const { shadow } = light as DirectionalLight | SpotLight;
            shadow.map ??= {} as never;
            draws.push({ light, seesFigure: figure.layers.test(view.layers) });
          }
        },
      },
    } as unknown as WebGLRenderer;
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.layers.enable(PLAYER_FIGURE_LAYER);
    const light = new DirectionalLight();
    light.position.set(...skyAt(12).light);
    const rig = new Group();
    rig.add(light, light.target);
    scene.add(rig);
    const meshes = new ChunkMeshes(0.5);
    scene.add(meshes.group);
    meshes.set('under', [-4, 0, -4], floor);
    meshes.set('behind', [-4, 0, 60], floor); // 30 m away, behind a player looking down -z
    meshes.set('far', [-4, 0, 600], floor); // 300 m away
    const torch = new SpotLight();
    torch.distance = 20;
    scene.add(torch);
    const shadows = new Shadows(renderer, scene, { light, rig }, meshes);
    shadows.attachTorch(torch);
    shadows.restore({ sun: true, torch: true, distance: 40 });
    const player = new Vector3(0, 1.6, 0);
    /** One frame as play.ts runs it: update, then the renderer asks for the shadow maps. */
    const frame = (strength: number, at = player): Light[] => {
      const before = draws.length;
      shadows.update(strength, at);
      renderer.shadowMap.render([], scene, camera);
      return draws.slice(before).map((draw) => draw.light);
    };
    return { shadows, draws, frame, light, torch, meshes, renderer, scene, camera };
  };

  it('starts with no shadows, takes the renderer over for good and draws maps at 2048 texels', () => {
    const { renderer, light } = setup();
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(light.shadow.mapSize.x).toBe(SUN_MAP_SIZE);
    expect(light.shadow.radius).toBeGreaterThan(1);
    const idle = new Shadows(
      renderer,
      new Scene(),
      { light: new DirectionalLight(), rig: new Group() },
      new ChunkMeshes(0.5),
    ).settings;
    expect(idle.sun).toBe(false);
    expect(idle.torch).toBe(false);
  });

  it('covers the set distance with a box that reaches back towards the sun', () => {
    const { shadows, light } = setup();
    const camera = light.shadow.camera as OrthographicCamera;
    expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual([-40, 40, 40, -40]);
    expect(camera.near).toBeLessThan(0);
    shadows.setDistance(64);
    expect(camera.right).toBe(64);
    expect(light.shadow.bias).toBeCloseTo(sunShadowBias(64).bias, 9);
    shadows.stepDistance();
    expect(shadows.distance).toBe(24);
    expect(camera.right).toBe(24);
  });

  it('keeps the light casting through day and night, and fades the shadow instead of switching it', () => {
    const { frame, light, shadows } = setup();
    frame(1);
    expect(light.castShadow).toBe(true);
    expect(light.shadow.intensity).toBe(1);
    frame(0.4);
    expect(light.shadow.intensity).toBe(0.4);
    frame(0);
    expect(light.castShadow).toBe(true);
    expect(light.shadow.intensity).toBe(0);
    expect(shadows.sunStrength).toBe(0);
  });

  it('draws the sun map on the first frame, then on the idle refresh, and straight away when it goes stale', () => {
    const { frame, light, meshes } = setup();
    expect([frame(1), frame(1), frame(1), frame(1)].map((lights) => lights.length)).toEqual([1, 0, 1, 0]);
    expect(frame(1)).toEqual([light]);
    // The player walks on: the old map is wrong, so draw now rather than wait for the refresh.
    const moved = new Vector3(1, 1.6, 0);
    expect(frame(1, moved)).toHaveLength(1);
    // A chunk changes, one frame after the last draw.
    meshes.set('new', [20, 0, 20], floor);
    expect(frame(1, moved)).toHaveLength(1);
    expect(frame(1, moved)).toHaveLength(0);
  });

  it('draws no sun map at night, and draws it again as soon as the shadows come back', () => {
    const { frame } = setup();
    frame(1);
    expect([frame(0), frame(0), frame(0)]).toEqual([[], [], []]);
    expect(frame(0.2)).toHaveLength(1);
  });

  it("has three.js allocate a casting light's map before the first main pass, even at night, with no casters", () => {
    const { frame, light, shadows, torch } = setup();
    expect(needsMap(light)).toBe(true);
    // Night from the first frame: no real draw is due, but the map must exist or the programs bind a placeholder.
    expect(frame(0)).toEqual([light]);
    expect(light.shadow.map).not.toBeNull();
    expect(shadows.casters.sun).toBe(0);
    expect(needsMap(light)).toBe(false);
    expect([frame(0), frame(0)]).toEqual([[], []]);
    // Day comes: the real draw follows, with casters.
    expect(frame(0.5)).toEqual([light]);
    expect(shadows.casters.sun).toBe(2);
    // The flashlight's map is allocated through the same pass the first frame it casts.
    torch.castShadow = true;
    expect(frame(0.5)).toContain(torch);
    expect(torch.shadow.map).not.toBeNull();
  });

  it('draws no sun map with sun shadows off, however bright the sun, and allocates one when they come on', () => {
    const { shadows, frame, light } = setup();
    shadows.setSun(false);
    expect(light.castShadow).toBe(false);
    expect([frame(1), frame(1), frame(1)]).toEqual([[], [], []]);
    shadows.setSun(true);
    expect(light.castShadow).toBe(true);
    expect(frame(1)).toHaveLength(1);
    // Switched off and on again at night: the map exists already, so nothing is drawn.
    shadows.setSun(false);
    shadows.setSun(true);
    expect(frame(0)).toEqual([]);
  });

  it('picks sun casters by the box around the player, including chunks behind them, and drops far ones', () => {
    const { frame, shadows, meshes } = setup();
    frame(1);
    expect(shadows.casters.sun).toBe(2);
    const casting = meshes.group.children.filter((child) => child.castShadow).map((child) => child.position.z);
    expect(casting.sort((a, b) => a - b)).toEqual([-4, 60]);
  });

  it('draws the flashlight map only while its light casts, through a camera that leaves out the player figure', () => {
    const { frame, torch, draws, shadows } = setup();
    torch.position.set(0, 1.6, 0);
    torch.castShadow = false;
    frame(0); // the sun's map is allocated here, empty
    draws.length = 0;
    frame(0);
    expect(draws).toHaveLength(0);
    torch.castShadow = true;
    const lights = frame(0);
    expect(lights).toEqual([torch]);
    expect(draws.at(-1)?.seesFigure).toBe(false);
    expect(shadows.casters.torch).toBe(1);
    // The sun's pass, by contrast, sees it.
    frame(1);
    expect(draws.some((draw) => draw.light !== torch && draw.seesFigure)).toBe(true);
  });

  it('leaves every other scene alone, such as the held items', () => {
    const { renderer, camera, draws, frame } = setup();
    frame(1);
    const before = draws.length;
    renderer.shadowMap.render([], new Scene(), camera);
    expect(draws).toHaveLength(before);
  });

  it('warms up the flashlight both casting and not, and leaves the light as it found it', () => {
    const { shadows, torch } = setup();
    const seen: boolean[] = [];
    const mood = {
      warmUp() {
        seen.push(torch.castShadow);
        return Promise.resolve();
      },
    };
    torch.castShadow = false;
    shadows.warmUp(mood, []);
    expect(seen).toEqual([true, false]);
    expect(torch.castShadow).toBe(false);
    seen.length = 0;
    shadows.setTorch(false);
    shadows.warmUp(mood, []);
    expect(seen).toEqual([false]);
  });
});

describe('frame time window', () => {
  it('gives the median and 95th percentile of what is in the window', () => {
    const times = new FrameTimes(2000);
    expect(times.summary().p50).toBeNaN();
    for (let i = 1; i <= 100; i++) {
      times.record(i * 10, i);
    }
    expect(times.summary()).toEqual({ p50: 50, p95: 95 });
  });

  it('forgets frames older than the window', () => {
    const times = new FrameTimes(2000);
    for (let i = 1; i <= 100; i++) {
      times.record(i * 10, 100);
    }
    // 3 s on: only this frame, and the one exactly 2 s before it, remain.
    times.record(3000, 10);
    expect(times.summary()).toEqual({ p50: 10, p95: 100 });
    times.record(3001, 12);
    times.record(5001, 14);
    expect(times.summary()).toEqual({ p50: 12, p95: 14 });
  });
});
