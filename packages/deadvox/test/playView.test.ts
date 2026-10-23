import { runInNewContext } from 'node:vm';
import {
  BoxGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  ShaderLib,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { inventoryLightSources, toggleLight } from '../src/core/lights.ts';
import type { Body } from '../src/core/physics.ts';
import { raycast } from '../src/core/raycast.ts';
import { skyAt } from '../src/core/sky.ts';
import type { SkyBounds } from '../src/core/skylight.ts';
import type { SkySnapshot } from '../src/core/skySnapshot.ts';
import { buildSkyResult, type SkyResult } from '../src/core/skyTransport.ts';
import type { Engine } from '../src/game/engine.ts';
import { ThirdPersonOrbit } from '../src/game/thirdPersonOrbit.ts';
import { flashlightDaylightScale } from '../src/render/flashlight.ts';
import { createPlayView } from '../src/render/playView.ts';
import { Skylight } from '../src/render/skylight.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { skyWorldFixture } from './fixtures/skyWorld.ts';
import { makeConfig } from './fixtures/startupContent.ts';

const registry = baseRegistry();

const meshFixture = () => ({
  setLinearColors: vi.fn(),
  setPatterns: vi.fn(),
  setOcclusion: vi.fn(),
  revealVersion: 0,
  isRevealed: () => true,
});

const fixture = (isSolid: Engine['isSolid'] = () => false) => {
  const inventory = new Inventory({ ...registry, models: new Map() });
  const page = new EventTarget();
  const renderer = { toneMapping: 0, toneMappingExposure: 1 };
  const mood = {
    post: false,
    restore: vi.fn(),
    render: vi.fn((draw: () => void) => draw()),
    setPainDesaturation: vi.fn(),
    setDrugVignette: vi.fn(),
    setNightVision: vi.fn(),
    setNightVisionFlare: vi.fn(),
    setSky: vi.fn(),
  };
  const shadows = { restore: vi.fn(), attachTorches: vi.fn(), warmUp: vi.fn(() => Promise.resolve()) };
  const engine = {
    config: { ...makeConfig(73, 64, 0.5), actors: 'boxes' },
    registry: inventory.registry,
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    meshes: meshFixture(),
    mood,
    shadows,
    sky: {
      scene: new Scene(),
      light: new DirectionalLight(),
      ambient: new HemisphereLight(),
      camera: new PerspectiveCamera(),
      radiusM: 64,
    },
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

const restingHands = {
  right: { offset: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 },
  left: { offset: [0, 0, 0] as Vec3, rotation: [0, 0, 0] as Vec3 },
};

const litBounds: Record<'doorway' | 'near-wall', SkyBounds> = {
  doorway: { min: [8, 1, 8], max: [23, 7, 25] },
  'near-wall': { min: [-10, 1, -10], max: [11, 7, 13] },
};

function populateDoorway(owner: ReturnType<typeof skyWorldFixture>): void {
  for (let y = 2; y < 6; y++) {
    for (let z = 15; z <= 17; z++) {
      owner.world.setBlock(8, y, z, 0);
    }
  }
  for (let x = -2; x <= 2; x++) {
    for (let z = 14; z <= 18; z++) {
      owner.world.setBlock(x, 0, z, owner.wall);
    }
  }
}

function populateNearWall(owner: ReturnType<typeof skyWorldFixture>): void {
  for (let x = -10; x <= 10; x++) {
    for (let y = 1; y < 7; y++) {
      for (let z = -10; z < 13; z++) {
        owner.world.setBlock(x, y, z, 0);
      }
    }
    for (let z = -10; z < 13; z++) {
      owner.world.setBlock(x, 0, z, owner.wall);
    }
    for (let z = 0; z < 13; z++) {
      owner.world.setBlock(x, 6, z, owner.wall);
    }
    for (let y = 1; y < 6; y++) {
      for (let z = -6; z <= -4; z++) {
        owner.world.setBlock(x, y, z, owner.wall);
      }
    }
  }
}

function litWorld(geometry: 'doorway' | 'near-wall') {
  const box = litBounds[geometry];
  const owner = skyWorldFixture([box]);
  if (geometry === 'doorway') {
    populateDoorway(owner);
  } else {
    populateNearWall(owner);
  }
  const pending: { input: SkySnapshot; receive: (result: SkyResult, ms: number) => void }[] = [];
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const cameraPosition: Vec3 = geometry === 'doorway' ? [0.25, 2.12, 8.25] : [0.25, 2.12, 0.25];
  const aim: Vec3 = geometry === 'doorway' ? [1, 0, 0] : [0, 0, -1];
  camera.position.set(...cameraPosition);
  camera.lookAt(camera.position.clone().add(new Vector3(...aim)));
  const sky = new Skylight(
    [box],
    { blockSize: 0.5, top: 31, viewRadiusM: 64 },
    {
      ...owner,
      bottom: 0,
      clock: () => 0,
      submit: (input, receive) => {
        pending.push({ input, receive });
        return true;
      },
    },
  );
  const position = camera.position.toArray().map((axis) => axis / 0.5) as Vec3;
  sky.update(scene, position);
  const job = pending.shift()!;
  job.receive(buildSkyResult(job.input), 0);
  sky.update(scene, position);
  if (!(sky.inspect()[0]?.complete && sky.inspect()[0]?.current && sky.inspect()[0]?.resident)) {
    throw new Error('test skylight fixture did not become current and resident');
  }
  const inventory = new Inventory({ ...registry, models: new Map() });
  const flashlight = inventory.create('flashlight');
  if (!inventory.add(flashlight, { kind: 'hand', side: 'left' })) {
    throw new Error('test flashlight could not be placed in the hand');
  }
  if (toggleLight(inventory.registry, flashlight, 0) !== undefined) {
    throw new Error('test flashlight could not be switched on');
  }
  const engine = {
    config: { ...makeConfig(73, 64, 0.5), actors: 'boxes' },
    registry: inventory.registry,
    scene,
    camera,
    sky: { scene, light: new DirectionalLight(), ambient: new HemisphereLight(), camera, radiusM: 64 },
    skylight: sky,
    isSolid: owner.knownOpaque,
    renderer: { toneMapping: 0, toneMappingExposure: 1 },
    meshes: meshFixture(),
    mood: {
      post: false,
      restore: vi.fn(),
      render: vi.fn((draw: () => void) => draw()),
      setNightVisionFlare: vi.fn(),
      setSky: vi.fn(),
    },
    shadows: { torchOn: true, restore: vi.fn(), attachTorches: vi.fn() },
  } as unknown as Engine;
  const view = createPlayView(engine, inventory, vi.fn(), new EventTarget());
  const daylight = skyAt(12, BASE_DAY_CYCLE);
  const updateFrame = () => {
    view.updateHeld(0, restingHands, flashlight);
    view.prepareLighting(daylight);
    view.updateHeld(0, restingHands, flashlight);
  };
  updateFrame();
  if (!view.held.lensOf(flashlight, new Vector3()) || view.flashlight.light.intensity <= 0) {
    throw new Error('test flashlight did not emit a held beam');
  }
  return {
    owner,
    engine,
    inventory,
    flashlight,
    view,
    sky,
    daylight,
    updateFrame,
    cleanup: () => {
      view.dispose();
      sky.dispose();
    },
  };
}

it('renders a hand beam and a worn beam together while both contribute to zombie sight', () => {
  const { inventory, view, engine } = fixture();
  const hand = inventory.create('flashlight');
  const worn = inventory.create('headlamp');
  expect(inventory.add(hand, { kind: 'hand', side: 'left' })).toBe(true);
  expect(inventory.add(worn, { kind: 'worn' })).toBe(true);
  expect(toggleLight(inventory.registry, hand)).toBeUndefined();
  expect(toggleLight(inventory.registry, worn)).toBeUndefined();

  view.updateHeld(0, restingHands, hand);
  const sources = inventoryLightSources(inventory, [0, 0, 0], 1.6);
  expect(sources.map((source) => source.seenFrom).sort()).toEqual(
    [hand, worn].map((item) => inventory.registry.items.get(item.type)!.light!.seenFrom).sort(),
  );
  expect(sources.every((source) => source.carried)).toBe(true);
  const beams = engine.scene.children.filter((child) => child.type === 'SpotLight') as import('three').SpotLight[];
  expect(beams.filter((light) => light.intensity > 0)).toHaveLength(2);

  expect(toggleLight(inventory.registry, hand)).toBeUndefined();
  view.updateHeld(0, restingHands, hand);
  expect(inventoryLightSources(inventory, [0, 0, 0], 1.6)).toHaveLength(1);
  expect(beams.filter((light) => light.intensity > 0)).toHaveLength(1);
  view.dispose();
});

const RECEIVER_SCALE = /getSpotLightInfo\([^;]+\);\s*directLight.color \*= ([^;]+);/;

function receiverLighting(f: ReturnType<typeof litWorld>, target: Vec3) {
  const material = new MeshLambertMaterial();
  const geometry = new BoxGeometry();
  const mesh = new Mesh(geometry, material);
  f.engine.scene.add(mesh);
  f.sky.update(f.engine.scene, f.engine.camera.position.toArray().map((axis) => axis / 0.5) as Vec3);
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: ShaderLib.lambert.vertexShader,
    fragmentShader: ShaderLib.lambert.fragmentShader,
  };
  material.onBeforeCompile(shader as never, null as never);
  try {
    const expression = RECEIVER_SCALE.exec(shader.fragmentShader)?.[1];
    if (!expression) {
      throw new Error('Skylight did not patch spotlight receiver attenuation');
    }
    // Execute the emitted scalar GLSL with the CPU sample of the same published field.
    const scale = Number(
      runInNewContext(expression.replaceAll('float(', 'Number(').replaceAll('pow(', 'Math.pow('), {
        uSkyDaylight: shader.uniforms.uSkyDaylight!.value,
        receiverSkyVisibility: f.sky.at(target),
      }),
    );
    return { scale, shader: shader.fragmentShader };
  } finally {
    f.engine.scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  }
}

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

  it('does not revive an expired hit recoil when a disabled block follows', () => {
    const { view } = fixture();
    const update = vi.spyOn(view.held, 'update').mockImplementation(() => undefined);
    const recoilNow = (dt: number) => {
      view.updateHeld(dt, restingHands, undefined);
      return update.mock.lastCall![2];
    };
    view.recoil(12);
    expect(recoilNow(0)).toBeGreaterThan(0);
    expect(recoilNow(10)).toBe(0);
    view.block({ strength: 0, realSeconds: 0.5, rise: 0, riseRealSeconds: 0.5 });
    expect(recoilNow(0)).toBe(0);
    view.block({ strength: 0.1, realSeconds: 0.5, rise: 0, riseRealSeconds: 0.5 });
    expect(recoilNow(0)).toBeLessThanOrEqual(0.1);
    view.dispose();
  });

  it('raises the arms when a block deflects a hit and lets them settle once the rise ends', () => {
    const { view } = fixture();
    const update = vi.spyOn(view.held, 'update').mockImplementation(() => undefined);
    const liftNow = (dt: number) => {
      view.updateHeld(dt, restingHands, undefined);
      return update.mock.lastCall![3]?.lift;
    };
    expect(liftNow(0)).toBe(0);
    view.block({ strength: 0.5, realSeconds: 0.05, rise: 0.02, riseRealSeconds: 0.4 });
    expect(liftNow(0.1)).toBeGreaterThan(0);
    expect(liftNow(10)).toBe(0);
    expect(liftNow(0.1)).toBe(0);
    view.dispose();
  });

  it('gives a dark receiver useful beam strength even with a sunlit camera', () => {
    const f = litWorld('doorway');
    try {
      const cameraPosition = f.engine.camera.position.toArray() as Vec3;
      const direction = f.engine.camera.getWorldDirection(new Vector3()).toArray() as Vec3;
      const hit = raycast(
        cameraPosition.map((axis) => axis / 0.5) as Vec3,
        direction,
        f.view.flashlight.light.distance / 0.5,
        f.owner.knownOpaque,
      );
      expect(hit).toBeDefined();
      expect(hit!.distance * 0.5).toBeLessThan(f.view.flashlight.light.distance);
      const face = new Vector3(...cameraPosition).addScaledVector(new Vector3(...direction), hit!.distance * 0.5);
      const target = face.addScaledVector(new Vector3(...hit!.normal), 0.25).toArray() as Vec3;
      expect(f.sky.at(cameraPosition)).toBe(1);
      expect(f.owner.knownOpaque(...(target.map((axis) => Math.floor(axis / 0.5)) as Vec3))).toBe(false);
      expect(f.sky.at(target)).toBeLessThan(f.sky.at(cameraPosition));
      const receiver = receiverLighting(f, target);
      expect(receiver.shader).toContain('float receiverSkyVisibility = skyVisibility(receiverSkyUnknown);');
      expect(receiver.shader).toContain('irradiance *= receiverSkyVisibility;');
      expect(f.view.flashlight.daylightScale * receiver.scale).toBeGreaterThan(
        flashlightDaylightScale(f.daylight) * 10,
      );
    } finally {
      f.cleanup();
    }
  });

  it('keeps beam output stable when aim crosses a sunlit doorway edge', () => {
    const f = litWorld('doorway');
    try {
      const glowstick = f.inventory.create('glowstick');
      expect(f.inventory.add(glowstick, { kind: 'hand', side: 'right' })).toBe(true);
      expect(toggleLight(f.inventory.registry, glowstick, 0)).toBeUndefined();
      f.engine.camera.position.set(0.25, 2.12, 8.25);
      expect(
        f.owner.knownOpaque(...(f.engine.camera.position.toArray().map((axis) => Math.floor(axis / 0.5)) as Vec3)),
      ).toBe(false);
      f.engine.camera.lookAt(f.engine.camera.position.clone().add(new Vector3(1, 0, 0)));
      f.updateFrame();
      const aimAt = (targetPoint: Vec3) => {
        f.engine.camera.lookAt(new Vector3(...targetPoint));
        f.updateFrame();
        const direction = f.engine.camera.getWorldDirection(new Vector3()).toArray() as Vec3;
        const hit = raycast(
          f.view.flashlight.light.position.toArray().map((axis) => axis / 0.5) as Vec3,
          direction,
          f.view.flashlight.light.distance / 0.5,
          f.owner.knownOpaque,
        );
        expect(hit).toBeDefined();
        const target = f.view.flashlight.light.position
          .clone()
          .addScaledVector(new Vector3(...direction), hit!.distance * 0.5)
          .addScaledVector(new Vector3(...hit!.normal), 0.005)
          .toArray() as Vec3;
        return {
          scale: f.view.flashlight.daylightScale,
          targetVisibility: f.sky.at(target),
          pointLights: f.view.lightPool.lights.filter((light) => light.intensity > 0).map((light) => light.intensity),
        };
      };
      const first = aimAt([11, 2.12, 8.25]);
      const second = aimAt([11, 2.12, 11]);
      expect(first.targetVisibility).not.toBe(second.targetVisibility);
      expect(second.scale).toBeCloseTo(first.scale);

      expect(first.pointLights).toHaveLength(1);
      expect(second.pointLights).toEqual(first.pointLights);
    } finally {
      f.cleanup();
    }
  });

  it('suppresses beam strength on a sunlit receiver even with a shaded camera', () => {
    const f = litWorld('near-wall');
    try {
      const cameraPosition = f.engine.camera.position.toArray() as Vec3;
      const direction = f.engine.camera.getWorldDirection(new Vector3()).toArray() as Vec3;
      const hit = raycast(
        cameraPosition.map((axis) => axis / 0.5) as Vec3,
        direction,
        f.view.flashlight.light.distance / 0.5,
        f.owner.knownOpaque,
      );
      expect(hit).toBeDefined();
      expect(hit!.distance * 0.5).toBeLessThan(f.view.flashlight.light.distance);
      const face = new Vector3(...cameraPosition).addScaledVector(new Vector3(...direction), hit!.distance * 0.5);
      const target = face.addScaledVector(new Vector3(...hit!.normal), 0.25).toArray() as Vec3;
      expect(f.sky.at(cameraPosition)).toBeLessThan(1);
      expect(f.owner.knownOpaque(...(target.map((axis) => Math.floor(axis / 0.5)) as Vec3))).toBe(false);
      expect(f.sky.at(target)).toBe(1);
      expect(f.view.flashlight.daylightScale * receiverLighting(f, target).scale).toBeLessThan(
        flashlightDaylightScale(f.daylight, f.sky.at(cameraPosition)),
      );
    } finally {
      f.cleanup();
    }
  });

  it('skips drawing and shadow warmup without renderer resources', async () => {
    const inventory = new Inventory({ ...registry, models: new Map() });
    const engine = {
      config: { ...makeConfig(73, 64, 0.5), actors: 'boxes' },
      registry: inventory.registry,
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      meshes: meshFixture(),
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

  it('passes the shared stride phase and the stance to the drawn body', () => {
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
        stance: 'prone',
        eye: [2, 4.24, 6],
        sightImpaired: false,
      },
      damage,
    );
    expect(sync).toHaveBeenCalledWith(expect.objectContaining({ gaitPhase: Math.PI / 2, stance: 'prone' }));
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
      stance: 'standing' as const,
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
        stance: 'standing' as const,
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
      stance: 'standing' as const,
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
        stance: 'standing' as const,
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
        stance: 'standing' as const,
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

  it('passes night vision to the mood for the player and none for a spectator', () => {
    const { mood, view } = fixture();
    const { nightVision } = registry.items.get('night_vision_goggles')!.light!;
    expect(nightVision).toBeDefined();
    const damage = { style: { opacity: '' } } as unknown as HTMLElement;
    const frame = {
      dt: 0.1,
      body: { pos: [2, 1, 6] as Vec3, vel: [0, 0, 0] as Vec3, halfWidth: 0.6, height: 3.6, onGround: true },
      paused: false,
      noclip: false,
      yaw: 0,
      pitch: 0,
      stridePhase: 0,
      stance: 'standing' as const,
      eye: [2, 4.24, 6] as Vec3,
      sightImpaired: false,
      nightVision,
    };
    view.updateCamera(frame, damage);
    expect(mood.setNightVision).toHaveBeenLastCalledWith(nightVision);
    view.updateCamera({ ...frame, spectator: { position: [2, 4, 6], yaw: 0, pitch: 0 } }, damage);
    expect(mood.setNightVision).toHaveBeenLastCalledWith(undefined);
    view.dispose();
  });
});
