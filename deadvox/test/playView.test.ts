import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Body } from '../src/core/physics.ts';
import { skyAt } from '../src/core/sky.ts';
import { flashlightDaylightScale } from '../src/render/flashlight.ts';
import { makeConfig } from '../src/game/config.ts';
import type { Engine } from '../src/game/engine.ts';
import { ThirdPersonOrbit } from '../src/game/thirdPersonOrbit.ts';
import { createPlayView } from '../src/render/playView.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown,
    })),
);

const fixture = (isSolid: Engine['isSolid'] = () => false) => {
  const inventory = new Inventory({ ...registry, models: new Map() });
  const page = new EventTarget();
  const renderer = { toneMapping: 0, toneMappingExposure: 1 };
  const mood = {
    post: false,
    restore: vi.fn(),
    render: vi.fn((draw: () => void) => draw()),
    setPainDesaturation: vi.fn(),
  };
  const shadows = { restore: vi.fn(), attachTorch: vi.fn(), warmUp: vi.fn(() => Promise.resolve()) };
  const engine = {
    config: { ...makeConfig(73, 64, 0.5), actors: 'boxes' },
    registry: inventory.registry,
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    meshes: { setLinearColors: vi.fn(), setPatterns: vi.fn(), setOcclusion: vi.fn() },
    mood,
    shadows,
    sky: {},
    isSolid,
  } as unknown as Engine;
  const view = createPlayView(engine, inventory, vi.fn(), page);
  return {
    engine,
    inventory,
    view,
    page,
    mood,
    shadows,
  };
};

describe('play presentation ownership', () => {
  it('routes one held draw through Mood with renderer, camera, and sky', async () => {
    const { engine, view, mood, shadows } = fixture();
    const draw = vi.spyOn(view.held, 'render').mockImplementation(() => undefined);
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(20).mockReturnValueOnce(25);
    expect(view.render()).toBe(5);
    expect(mood.render).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledExactlyOnceWith(engine.renderer, engine.camera, engine.sky);
    clock.mockRestore();
    await view.warmUp();
    expect(shadows.warmUp).toHaveBeenCalledExactlyOnceWith(engine.mood, [
      { scene: engine.scene, camera: engine.camera },
      view.held.warmUpTarget,
    ]);
    view.dispose();
  });

  it('keeps a beam bright when a lit camera aims at a dark target', () => {
    const { engine, view } = fixture((_x, _y, z) => z === -18);
    engine.camera.position.set(1, 1, 0);
    engine.camera.lookAt(1, 1, -1);
    engine.skylight = {
      at: ([, , z]: Vec3) => (z < -6 ? 0 : 1),
    } as unknown as NonNullable<Engine['skylight']>;
    engine.camera.updateMatrixWorld();
    view.flashlight.light.position.copy(engine.camera.position);
    view.flashlight.light.distance = 20;
    view.flashlight.light.intensity = 1;
    const at = engine.skylight.at.bind(engine.skylight);
    const setSkyVisibility = vi.spyOn(view.held, 'setSkyVisibility');

    view.prepareLighting(skyAt(12));

    expect(at([1, 1, 0])).toBe(1);
    expect(at([1, 1, -8.5])).toBe(0);
    expect(setSkyVisibility).toHaveBeenCalledExactlyOnceWith(1);
    expect(view.flashlight.daylightScale).toBeGreaterThan(flashlightDaylightScale(skyAt(12), 1));
    view.dispose();
  });

  it('keeps carried point-light brightness independent of aim', () => {
    const { engine, inventory, view } = fixture();
    const glowstick = inventory.create('glowstick');
    glowstick.on = true;
    expect(inventory.add(glowstick, { kind: 'hand', side: 'right' })).toBe(true);
    engine.camera.position.set(1, 1, 0);
    engine.skylight = { at: ([, , z]: Vec3) => (z < -2 ? 1 : 0) } as unknown as NonNullable<Engine['skylight']>;
    const pose = {
      right: { offset: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 },
      left: { offset: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 },
    };

    engine.camera.lookAt(1, 1, -1);
    view.prepareLighting(skyAt(12));
    view.updateHeld(0, pose, undefined);
    const darkAimIntensity = view.lightPool.lights[0]!.intensity;
    engine.camera.lookAt(1, 1, 1);
    view.prepareLighting(skyAt(12));
    view.updateHeld(0, pose, undefined);

    expect(darkAimIntensity).toBeGreaterThan(0);
    expect(view.lightPool.lights[0]!.intensity).toBe(darkAimIntensity);
    view.dispose();
  });

  it('keeps the daylight fade when the beam hits a nearby sunlit wall from shade', () => {
    const { engine, view } = fixture((_x, _y, z) => z === -2);
    engine.camera.position.set(1, 1, 0);
    engine.camera.lookAt(1, 1, -1);
    engine.camera.updateMatrixWorld();
    engine.skylight = { at: ([, , z]: Vec3) => (z < -0.2 && z > -1 ? 1 : 0) } as unknown as NonNullable<Engine['skylight']>;
    view.flashlight.light.position.copy(engine.camera.position);
    view.flashlight.light.distance = 20;
    view.flashlight.light.intensity = 1;

    view.prepareLighting(skyAt(12));

    expect(engine.skylight.at([1, 1, 0])).toBe(0);
    expect(engine.skylight.at([1, 1, -0.49])).toBe(1);
    expect(view.flashlight.daylightScale).toBe(flashlightDaylightScale(skyAt(12), 1));
    view.dispose();
  });

  it('skips drawing and shadow warmup without renderer resources', async () => {
    const inventory = new Inventory({ ...registry, models: new Map() });
    const engine = {
      config: { ...makeConfig(73, 64, 0.5), actors: 'boxes' },
      registry: inventory.registry,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      meshes: { setLinearColors: vi.fn(), setPatterns: vi.fn(), setOcclusion: vi.fn() },
      sky: {},
      isSolid: () => false,
    } as unknown as Engine;
    const view = createPlayView(engine, inventory, vi.fn(), new EventTarget());

    expect(view.render()).toBeNull();
    await expect(view.warmUp()).resolves.toBeUndefined();
    view.dispose();
  });

  it('releases owned pile and case instances on pagehide', () => {
    const { page, view } = fixture();
    const piles = vi.spyOn(view.piles, 'dispose');
    const cases = vi.spyOn(view.caseEffects, 'dispose');
    expect(piles).not.toHaveBeenCalled();
    expect(cases).not.toHaveBeenCalled();
    page.dispatchEvent(new Event('pagehide'));
    expect(piles).toHaveBeenCalledTimes(1);
    expect(cases).toHaveBeenCalledTimes(1);
  });

  it('uses the shared stride phase for the rendered walk cycle', () => {
    const { view } = fixture();
    const body: Body = { pos: [2, 1, 6], vel: [0, 0, -1], halfWidth: 0.6, height: 3.6, onGround: true };
    const sync = vi.spyOn(view.playerMeshes, 'sync');
    const damage = { style: { opacity: '' } } as unknown as HTMLElement;
    view.updateCamera(
      {
        dt: 0.1,
        body,
        paused: false,
        noclip: false,
        yaw: 0,
        pitch: 0,
        stridePhase: 0.25,
        eye: [2, 4.24, 6],
        sightImpaired: false,
      },
      damage,
    );
    expect(sync).toHaveBeenCalledWith(expect.objectContaining({ gaitPhase: Math.PI / 2 }));
    view.dispose();
  });

  it('switches the presentation to third person and restores first-person hands and camera', () => {
    const { engine, view } = fixture();
    const body: Body = { pos: [2, 1, 6], vel: [0, 0, 0], halfWidth: 0.6, height: 3.6, onGround: true };
    const damage = { style: { opacity: '' } } as unknown as HTMLElement;
    const sync = vi.spyOn(view.playerMeshes, 'sync');
    const heldDraw = vi.spyOn(view.held, 'render').mockImplementation(() => undefined);
    const frame = {
      dt: 0.1,
      body,
      paused: false,
      noclip: false,
      yaw: 0,
      pitch: 0,
      stridePhase: 0,
      eye: [2, 4.24, 6] as Vec3,
      sightImpaired: false,
    };

    view.updateCamera(frame, damage);
    view.render();
    const firstPersonRotation = engine.camera.rotation.clone();
    expect(heldDraw).toHaveBeenCalledTimes(1);

    view.updateCamera({ ...frame, thirdPerson: true }, damage);
    const thirdPersonPosition = engine.camera.position.clone();
    view.render();
    expect(thirdPersonPosition.toArray()).not.toEqual([1, 2.12, 3]);
    expect(sync).toHaveBeenLastCalledWith(expect.objectContaining({ thirdPerson: true }));
    expect(heldDraw).toHaveBeenCalledTimes(1);

    view.updateCamera(frame, damage);
    view.render();
    expect(engine.camera.position.toArray()).toEqual([1, 2.12, 3]);
    expect(engine.camera.rotation.equals(firstPersonRotation)).toBe(true);
    expect(sync).toHaveBeenLastCalledWith(expect.objectContaining({ thirdPerson: false }));
    expect(heldDraw).toHaveBeenCalledTimes(2);
    view.dispose();
  });

  it('pulls the third-person camera short of a solid wall behind the player', () => {
    const { engine, view } = fixture((_x, _y, z) => z === 8);
    const body: Body = { pos: [2, 1, 6], vel: [0, 0, 0], halfWidth: 0.6, height: 3.6, onGround: true };
    const damage = { style: { opacity: '' } } as unknown as HTMLElement;
    view.updateCamera(
      {
        dt: 0.1,
        body,
        paused: false,
        noclip: false,
        yaw: 0,
        pitch: 0,
        stridePhase: 0,
        eye: [2, 4.24, 6],
        thirdPerson: true,
        sightImpaired: false,
      },
      damage,
    );

    expect(engine.camera.position.z / 0.5).toBeGreaterThan(6);
    expect(engine.camera.position.z / 0.5).toBeLessThan(8);
    view.dispose();
  });

  it('starts orbit at the follow offset and applies orbit pitch', () => {
    const { engine, view } = fixture();
    const body: Body = { pos: [2, 1, 6], vel: [0, 0, 0], halfWidth: 0.6, height: 3.6, onGround: true };
    const damage = { style: { opacity: '' } } as unknown as HTMLElement;
    const frame = {
      dt: 0.1,
      body,
      paused: false,
      noclip: false,
      yaw: 0,
      pitch: 0,
      stridePhase: 0,
      eye: [2, 4.24, 6] as Vec3,
      thirdPerson: true,
      sightImpaired: false,
    };
    view.updateCamera(frame, damage);
    const followPosition = engine.camera.position.clone();
    const orbit = new ThirdPersonOrbit();
    orbit.begin(0);
    view.updateCamera({ ...frame, thirdPersonOrbit: orbit.angle(true)! }, damage);
    expect(engine.camera.position.toArray()).toEqual(followPosition.toArray());

    expect(orbit.rotate(0, -10_000, true)).toBe(true);
    const upwardAngle = orbit.angle(true);
    expect(upwardAngle?.pitch).toBeGreaterThan(0);
    view.updateCamera({ ...frame, thirdPersonOrbit: upwardAngle! }, damage);
    const cameraAtUpperLimit = engine.camera.position.clone();
    expect(cameraAtUpperLimit.y).toBeGreaterThan(followPosition.y);

    expect(orbit.rotate(0, 10, true)).toBe(true);
    view.updateCamera({ ...frame, thirdPersonOrbit: orbit.angle(true)! }, damage);
    expect(engine.camera.position.y).toBeLessThan(cameraAtUpperLimit.y);
    view.dispose();
  });

  it('pulls the orbit camera short of a solid wall', () => {
    const { engine, view } = fixture((x) => x === 4);
    const body: Body = { pos: [2, 1, 6], vel: [0, 0, 0], halfWidth: 0.6, height: 3.6, onGround: true };
    const damage = { style: { opacity: '' } } as unknown as HTMLElement;
    view.updateCamera(
      {
        dt: 0.1,
        body,
        paused: false,
        noclip: false,
        yaw: 0,
        pitch: 0,
        stridePhase: 0,
        eye: [2, 4.24, 6],
        thirdPerson: true,
        thirdPersonOrbit: { yaw: Math.PI / 2, pitch: 0 },
        sightImpaired: false,
      },
      damage,
    );

    expect(engine.camera.position.x / 0.5).toBeGreaterThan(2);
    expect(engine.camera.position.x / 0.5).toBeLessThan(4);
    view.dispose();
  });

  it('projects block-space camera/player state without advancing the body', () => {
    const { engine, view } = fixture();
    const body: Body = { pos: [2, 1, 6], vel: [0, 0, 0], halfWidth: 0.6, height: 3.6, onGround: true };
    const before = structuredClone(body);
    const damage = { style: { opacity: '' } } as unknown as HTMLElement;
    view.updateCamera(
      {
        dt: 0.1,
        body,
        paused: false,
        noclip: false,
        yaw: 0,
        pitch: 0,
        stridePhase: 0,
        eye: [2, 4.24, 6],
        sightImpaired: false,
      },
      damage,
    );
    expect(engine.camera.position.toArray()).toEqual([1, 2.12, 3]);
    expect(body).toEqual(before);
    expect(damage.style.opacity).toBe('0');
    view.dispose();
  });
});
