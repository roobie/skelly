import { readFileSync } from 'node:fs';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  type Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it, vi } from 'vitest';
import { aimBasis } from '../src/core/aim.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { readyMeleePose } from '../src/core/meleePose.ts';
import { insideLensAperture, mountedOptic, type OpticLensFrame, projectLensAperture } from '../src/core/opticView.ts';
import { opticWindowDistance } from '../src/core/opticWindow.ts';
import { makeScale } from '../src/core/scale.ts';
import { equipDebugLoadout } from '../src/debug/debugLoadout.ts';
import { HeldItems } from '../src/render/hands.ts';
import { HeldPresentation } from '../src/render/heldPresentation.ts';
import { createHeldViews } from '../src/render/heldViews.ts';
import { stepMagazineRaise } from '../src/render/magazineLoadPose.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { OpticLensRenderer, opticLensPass, setOpticLensUniforms } from '../src/render/opticLens.ts';
import { configureOpticsSpike } from '../src/render/opticsSpike.ts';
import { PlayerMeshes } from '../src/render/playerFigure.ts';
import { baseRegistry } from './baseRegistry.ts';
import { loadFigureModels } from './figureModels.ts';
import { createPlayerBody } from './playerFixture.ts';

vi.mock('../src/render/magazineLoadPose.ts', { spy: true });

const fixture = async (firearm = true, preview?: string, heldLook?: ModelLibrary['heldLook']) => {
  const base = baseRegistry();
  const gun = [...base.items.values()].find(
    (def) =>
      def.firearm &&
      base.models
        .get(def.model!)
        ?.gun?.attachments?.some((attachment) =>
          [...base.models.values()].some(
            (model) => model.gun?.attachment?.id === attachment.id && model.gun.attachment.kind === 'optic',
          ),
        ),
  );
  if (!gun) {
    throw new Error('Need an optic-equipped firearm source');
  }
  const itemDef = firearm
    ? { ...gun, id: 'actor-fixture-item' }
    : {
        id: 'actor-fixture-item',
        name: 'Fixture item',
        category: 'misc' as const,
        weight: 100,
        economy: { usage: [], tiers: [] },
        workInProgress: false,
        notLoot: false,
        size: [2, 2] as [number, number],
        twoHanded: true,
      };
  const registry = { ...base, items: new Map(base.items).set(itemDef.id, itemDef) };
  const inventory = new Inventory(registry);
  if (preview && !equipDebugLoadout(inventory, true, true, preview)) {
    throw new Error('Preview loadout was not applied');
  }
  const item = preview ? (inventory.hands.right ?? inventory.hands.left)! : inventory.create(itemDef.id);
  if (!item) {
    throw new Error('Preview did not equip a firearm');
  }
  if (!(preview || inventory.add(item, { kind: 'hand', side: 'right' }))) {
    throw new Error('Cannot hold fixture item');
  }
  const figure = registry.figures.get('player')!;
  const models = {
    version: 0,
    ...(await loadFigureModels(registry)),
    partBounds: () => undefined,
    heldLook: heldLook ?? (() => ({ root: new Group().add(new Group().add(new Group())), parts: [], slots: {} })),
  } as unknown as ModelLibrary;
  const scale = makeScale(0.5);
  const world = new PlayerMeshes(scale.blockSize, figure, registry.models, models);
  const actor = {
    body: createPlayerBody(scale, 0, 0, 0),
    yaw: 0.3,
    pitch: -0.2,
    stepOffset: 0,
    gaitPhase: 0,
    moving: false,
    stance: 'standing' as const,
    dt: 0,
    thirdPerson: true,
    inventory,
  };
  world.sync(actor);
  const view = new HeldItems(inventory, models, figure);
  const update = createHeldViews(inventory, view, world);
  const camera = new PerspectiveCamera();
  const pose = readyMeleePose(false, figure.holds);
  const physical = () => world.group.getObjectByName('world-held-items')!;
  const transforms = (): number[][] => {
    const result: number[][] = [];
    physical().updateWorldMatrix(true, true);
    physical().traverse((object) => result.push([...object.matrixWorld.elements]));
    return result;
  };
  const dispose = () => {
    world.dispose();
    view.dispose();
  };
  return { registry, inventory, item, world, actor, view, update, camera, pose, physical, transforms, dispose };
};

it('orbit and spectator orientation cannot change world handling transforms for the same actor input', async () => {
  const f = await fixture();
  const handling = {
    firearms: [],
    readiness: { uid: f.item.uid, progress: 1, aimingDownSights: false },
    aim: { yaw: 0.07, pitch: -0.04 },
  };
  try {
    f.update(f.camera, f.pose, 0.4, { ...handling, lift: 0.01 });
    const expected = f.transforms();
    for (const [pitch, yaw] of [
      [0.6, -1.1],
      [-0.7, 2.1],
    ]) {
      f.camera.rotation.set(pitch!, yaw!, 0, 'YXZ');
      f.camera.updateMatrixWorld(true);
      f.update(f.camera, f.pose, 0.4, { ...handling, lift: 0.01 });
      expect(f.transforms()).toEqual(expected);
    }
    f.world.sync({ ...f.actor, yaw: f.actor.yaw + 0.5 });
    f.update(f.camera, f.pose, 0.4, handling);
    expect(f.transforms()).not.toEqual(expected);
  } finally {
    f.dispose();
  }
});

it('the play frame poses overlay and world held views from this frame rather than the previous view', async () => {
  const source = readFileSync(new URL('../src/game/play.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const updateFrame =');
  const end = source.indexOf('const skyRoute =', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  // Replay the production frame's presentation calls without booting terrain streaming or the DOM.
  const frame = source.slice(start, end);
  const calls = [...frame.matchAll(/\b(updateVisualFeedback|updateHeldItems|finishDraw)\(/g)].map((match) => match[1]!);
  expect(new Set(calls).size).toBe(3);
  expect(calls).toHaveLength(3);
  const fixtures = await Promise.all(
    (['world', 'effect', undefined] as const).map(async (mode) => ({ mode, f: await fixture() })),
  );
  for (const { mode, f } of fixtures) {
    const scene = new Scene();
    if (mode) {
      f.view.configureOpticsSpike(scene, mode, 'relief');
    }
    const heldFrame = (mode ? scene : f.view.warmUpTarget.scene).getObjectByName('held-items-view')!;
    const next = new PerspectiveCamera();
    const worldSample = new PerspectiveCamera();
    const syncHeldView = f.world.syncHeldView.bind(f.world);
    const world = vi.spyOn(f.world, 'syncHeldView').mockImplementation((...args) => {
      syncHeldView(...args);
      worldSample.position.copy(f.physical().position);
      worldSample.quaternion.copy(f.physical().quaternion);
    });
    const steps: Record<string, () => void> = {
      updateVisualFeedback: () => {
        f.camera.position.copy(next.position);
        f.camera.quaternion.copy(next.quaternion);
        f.camera.updateMatrixWorld(true);
        f.world.sync({
          ...f.actor,
          eye: [next.position.x / 0.5, next.position.y / 0.5, next.position.z / 0.5],
          yaw: next.rotation.y,
          pitch: next.rotation.x,
        });
      },
      updateHeldItems: () =>
        f.update(f.camera, f.pose, 0, {
          firearms: [],
          readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
        }),
      finishDraw: () => {
        for (const sample of [heldFrame, f.view.warmUpTarget.camera, worldSample]) {
          expect(sample.position.distanceTo(next.position)).toBeLessThan(1e-8);
          expect(sample.quaternion.toArray()).toEqual(next.quaternion.toArray());
        }
        expect(f.view.opticLensFrame).toBeDefined();
      },
    };
    try {
      next.position.set(1, 2, 3);
      next.rotation.set(0.3, -0.7, 0, 'YXZ');
      for (const call of calls) {
        steps[call]!();
      }
      next.position.set(-2, 1, 4);
      next.rotation.set(-0.4, 1.2, 0, 'YXZ');
      for (const call of calls) {
        steps[call]!();
      }
      expect(world).toHaveBeenCalledTimes(2);
    } finally {
      world.mockRestore();
      f.dispose();
    }
  }
});

it('both adapters consume one animation advance per actor tick', async () => {
  const f = await fixture();
  const advance = vi.mocked(stepMagazineRaise);
  advance.mockClear();
  const view = vi.spyOn(f.view, 'update');
  const world = vi.spyOn(f.world, 'syncHeldView');
  try {
    f.update(f.camera, f.pose, 0, { firearms: [], dt: 1 / 60 });
    expect(advance).toHaveBeenCalledTimes(1);
    expect(view.mock.calls[0]![3]).toBe(world.mock.calls[0]![1]);
    f.update(f.camera, f.pose, 0, { firearms: [], dt: 1 / 60 });
    expect(advance).toHaveBeenCalledTimes(2);
  } finally {
    advance.mockRestore();
    view.mockRestore();
    world.mockRestore();
    f.dispose();
  }
});

it('final arm solving samples the rummage mover output in world and overlay, and cancellation restores grips', async () => {
  const f = await fixture(false);
  f.world.sync({ ...f.actor, heldItems: { registry: f.registry, hands: f.inventory.hands } });
  const queue = new HandlingQueue(f.inventory);
  const solved: { owner: HeldPresentation; anchor: Object3D; point: Vector3; hand: Object3D }[] = [];
  const { solve } = HeldPresentation.prototype;
  const spy = vi.spyOn(HeldPresentation.prototype, 'solve').mockImplementation(function (
    this: HeldPresentation,
    side,
    shoulder,
    grip,
  ) {
    solve.call(this, side, shoulder, grip);
    solved.push({
      owner: this,
      anchor: this.gripAnchors.get(side)!,
      point: this.gripAnchors.get(side)!.getWorldPosition(new Vector3()),
      hand: this.armRigs.get(side)!.hand,
    });
  });
  try {
    f.update(f.camera, f.pose, 0, { firearms: [] });
    const rest = f.transforms();
    solved.length = 0;
    expect(queue.enqueue(f.item, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
    queue.tick(queue.remaining / 2);
    f.update(f.camera, f.pose, 0, { firearms: [], job: queue.jobs[0] });
    expect(f.transforms()).not.toEqual(rest);
    expect(solved.some(({ owner }) => owner.frame.name === 'world-held-items')).toBe(true);
    expect(solved.some(({ owner }) => owner.frame.name === 'held-items-view')).toBe(true);
    for (const { anchor, point, hand } of solved) {
      expect(anchor.getWorldPosition(new Vector3()).distanceTo(point)).toBeLessThan(1e-8);
      expect(hand.getWorldPosition(new Vector3()).distanceTo(point)).toBeLessThan(1e-8);
    }
    queue.cancel();
    f.update(f.camera, f.pose, 0, { firearms: [] });
    expect(f.transforms()).toEqual(rest);
  } finally {
    spy.mockRestore();
    f.dispose();
  }
});

it.each([
  ['', true],
  ['?optics=world', true],
  ['?optics=world&eye=fill', false],
  ['?optics=world&eye=relief', true],
  ['?optics=effect&eye=relief', false],
] as const)('eye placement and projected aperture agree for %s', async (search, relief) => {
  const f = await fixture();
  const transform = vi.spyOn(HeldPresentation.prototype, 'firearmTransform');
  vi.stubGlobal('location', { search });
  const scene = new Scene();
  try {
    configureOpticsSpike(f.view, scene, f.camera);
    f.view.update(f.camera, f.pose, 0, {
      firearms: [],
      readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
    });
    const [input] = transform.mock.calls.at(-1)!;
    expect(input.aimingDownSights).toBe(true);
    const sight = input.model.gun!.sight!;
    if (relief) {
      expect(input.adsApertureFill).toBeUndefined();
    } else {
      expect(input.adsApertureFill).toBeGreaterThan(0);
    }
    const distance = relief
      ? sight.eyeReliefMetres
      : opticWindowDistance(sight.ocularDiameterMetres!, input.adsApertureFill!, f.camera.fov);
    const expected = projectLensAperture({
      center: [0, 0, -distance],
      right: [1, 0, 0],
      up: [0, 1, 0],
      radius: sight.ocularDiameterMetres! / 2,
      verticalFovDegrees: f.camera.fov,
      aspect: f.camera.aspect,
    });
    expect(expected).toBeDefined();
    expect(f.view.opticLensFrame).toBeDefined();
    expect(f.view.opticLensFrame!.radius[0]).toBeCloseTo(expected!.radius[0]);
    expect(f.view.opticLensFrame!.radius[1]).toBeCloseTo(expected!.radius[1]);
    expect(f.view.opticLensFrame!.reticleCenter[0]).toBeCloseTo(expected!.center[0]);
    expect(f.view.opticLensFrame!.reticleCenter[1]).toBeCloseTo(expected!.center[1]);
    expect(scene.getObjectByName('held-item-right')!.visible).toBe(true);
  } finally {
    transform.mockRestore();
    vi.unstubAllGlobals();
    f.dispose();
  }
});

it.each([
  { loadout: 'ar', opticType: 'optic_holographic', search: '', mode: 'world', disc: true },
  { loadout: 'ar', opticType: 'optic_holographic', search: '?tube=none', mode: 'world', disc: false },
  { loadout: 'ar', opticType: 'optic_holographic', search: '?optics=effect', mode: 'effect', disc: false },
] as const)(
  '$opticType with $search selects the requested disc presentation',
  async ({ loadout, opticType, search, mode, disc }) => {
    const f = await fixture(true, `?loadout=${loadout}&optic=${opticType}`);
    vi.stubGlobal('location', { search });
    try {
      expect(configureOpticsSpike(f.view, new Scene(), f.camera)).toBe(mode);
      f.view.update(f.camera, f.pose, 0, {
        firearms: [],
        readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
      });
      expect(f.view.opticLensFrame!.worldAtUnity).toBe(disc);
    } finally {
      vi.unstubAllGlobals();
      f.dispose();
    }
  },
);

const unityOpticTypes = (): string[] => {
  const registry = baseRegistry();
  const types = [...registry.items.values()]
    .filter((item) => {
      const attachment = item.model ? registry.models.get(item.model)?.gun?.attachment : undefined;
      if (attachment?.kind !== 'optic') {
        return false;
      }
      const range = attachment.properties.magnification;
      return range ? range.min <= 1 && range.max >= 1 : (item.opticMagnification ?? 1) === 1;
    })
    .map(({ id }) => id);
  if (types.length === 0) {
    throw new Error('Need an authored unity optic to exercise disc rendering');
  }
  return types;
};

it.each(unityOpticTypes())(
  '%s defaults to a unity disc retaining gun pieces but excluding its own optic',
  async (opticType) => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const compositions = new Map<Object3D, ReturnType<ModelLibrary['heldLook']>>();
    const f = await fixture(true, `?loadout=ar&optic=${opticType}`, (look) => {
      const root = new Group().add(new Group().add(new Group()));
      const parts = new Group().add(
        new Mesh(geometry, material),
        new Mesh(geometry, material),
        new Mesh(geometry, material),
      );
      root.children[0]!.children[0]!.add(parts);
      const slots = Object.fromEntries(
        look.slots.map(({ slot, model }) => {
          const frame = new Group();
          parts.add(frame);
          if (model === undefined) {
            return [slot, { frame }];
          }
          const fitted = new Group().add(new Mesh(geometry, material), new Mesh(geometry, material));
          frame.add(fitted);
          return [slot, { frame, model: fitted, modelId: model }];
        }),
      );
      const composed = { root, parts: [], slots };
      compositions.set(root, composed);
      return composed;
    });
    const scene = new Scene();
    vi.stubGlobal('location', { search: '' });
    configureOpticsSpike(f.view, scene, f.camera);
    const lens = new OpticLensRenderer();
    const foreignOptic = new Mesh(geometry, material);
    scene.add(foreignOptic);
    try {
      const optic = mountedOptic(f.registry, f.item)!;
      const range = optic.model.gun!.attachment!.properties.magnification;
      f.view.update(f.camera, f.pose, 0, {
        firearms: [],
        readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
        ...(range && range.min < range.max
          ? { opticZoom: { uid: f.item.uid, opticUid: optic.uid, magnification: 1 } }
          : {}),
      });
      const frame = f.view.opticLensFrame;
      expect(frame).toBeDefined();
      expect(frame!.magnification).toBe(1);
      expect(frame!.worldAtUnity).toBe(true);
      const owner = scene.getObjectByName('held-item-right')!;
      const [slot] = Object.entries(f.item.slots!).find(([, child]) => child?.uid === optic.uid)!;
      const composed = [...compositions].find(([root]) => owner.getObjectById(root.id))![1]!;
      const mounted = composed.slots[slot]!.model!;
      const opticPieces = new Set<Mesh>();
      mounted.traverse((object) => {
        if (object instanceof Mesh) {
          opticPieces.add(object);
        }
      });
      const gunPieces: Mesh[] = [];
      owner.traverse((object) => {
        if (object instanceof Mesh && !opticPieces.has(object)) {
          gunPieces.push(object);
        }
      });
      expect(opticPieces.size).toBeGreaterThan(0);
      expect(gunPieces.length).toBeGreaterThan(0);
      const render = vi.fn((world: Scene, camera: PerspectiveCamera) => {
        const drawn = new Set<Mesh>();
        world.traverseVisible((object) => {
          if (object instanceof Mesh && camera.layers.test(object.layers)) {
            drawn.add(object);
          }
        });
        for (const piece of gunPieces) {
          expect(drawn.has(piece)).toBe(true);
        }
        for (const piece of opticPieces) {
          expect(drawn.has(piece)).toBe(false);
        }
        expect(drawn.has(foreignOptic)).toBe(true);
      });
      const renderer = {
        getDrawingBufferSize: (out: Vector2) => out.set(8, 8),
        getRenderTarget: () => null,
        setRenderTarget: () => undefined,
        render,
      } as unknown as WebGLRenderer;
      lens.prepare(renderer, scene, f.camera, frame!);
      expect(render).toHaveBeenCalledOnce();
      for (const piece of opticPieces) {
        expect(f.camera.layers.test(piece.layers)).toBe(true);
      }
    } finally {
      lens.dispose();
      f.dispose();
      geometry.dispose();
      material.dispose();
      vi.unstubAllGlobals();
    }
  },
);

it('holographic relief changes the physical eye distance and its projected window together', async () => {
  const f = await fixture(true, '?loadout=ar&optic=optic_holographic');
  const scene = new Scene();
  const transform = vi.spyOn(HeldPresentation.prototype, 'firearmTransform');
  const frames: OpticLensFrame[] = [];
  const offsets: number[][] = [];
  try {
    for (const eye of ['fill', 'relief'] as const) {
      vi.stubGlobal('location', { search: `?optics=world&eye=${eye}` });
      configureOpticsSpike(f.view, scene, f.camera);
      f.view.update(f.camera, f.pose, 0, {
        firearms: [],
        readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
      });
      const [input] = transform.mock.calls.at(-1)!;
      const sight = input.model.gun!.sight!;
      const distance =
        eye === 'relief'
          ? sight.eyeReliefMetres
          : opticWindowDistance(sight.ocularDiameterMetres!, input.adsApertureFill!, f.camera.fov);
      const expected = projectLensAperture({
        center: [0, 0, -distance],
        right: [1, 0, 0],
        up: [0, 1, 0],
        radius: sight.ocularDiameterMetres! / 2,
        verticalFovDegrees: f.camera.fov,
        aspect: f.camera.aspect,
      });
      expect(f.view.opticLensFrame!.radius[1]).toBeCloseTo(expected!.radius[1]);
      frames.push(f.view.opticLensFrame!);
      offsets.push(transform.mock.results.at(-1)!.value.rootOffset);
    }
    expect(frames[1]!.radius[1]).toBeLessThan(frames[0]!.radius[1]);
    expect(offsets[1]).not.toEqual(offsets[0]);
  } finally {
    transform.mockRestore();
    vi.unstubAllGlobals();
    f.dispose();
  }
});

it.each(['optic_holographic', 'optic_lpvo_1_6x'])(
  '%s relief reticle follows the world-image aim ray rather than a translated glass window',
  async (opticType) => {
    const f = await fixture(true, `?loadout=ar&optic=${opticType}`);
    const world = new Scene();
    f.view.configureOpticsSpike(world, 'world', 'relief');
    const optic = mountedOptic(f.registry, f.item)!;
    const magnification = optic.model.gun!.attachment!.properties.magnification?.max ?? 1;
    const pass = opticLensPass();
    const lens = new OpticLensRenderer();
    const imageCamera = f.camera.clone();
    const renderer = {
      getDrawingBufferSize: (out: Vector2) => out.set(8, 8),
      getRenderTarget: () => null,
      setRenderTarget: () => undefined,
      render: (_scene: Scene, camera: PerspectiveCamera) => imageCamera.copy(camera),
    } as unknown as WebGLRenderer;
    const aim = { yaw: 0.01, pitch: -0.012 };
    const centers: number[][] = [];
    try {
      for (const lift of [0, 0.002]) {
        f.view.update(f.camera, f.pose, 0, {
          firearms: [],
          aim,
          lift,
          readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true },
          ...(magnification > 1 ? { opticZoom: { uid: f.item.uid, opticUid: optic.uid, magnification } } : {}),
        });
        const frame = f.view.opticLensFrame!;
        expect(frame).toBeDefined();
        setOpticLensUniforms(pass, frame);
        lens.prepare(renderer, world, f.camera, frame);
        const ray = new Vector3(...aimBasis(0, 0, aim).forward).project(imageCamera);
        expect(pass.uniforms.uReticleCenter!.value.x).toBeCloseTo((ray.x + 1) / 2);
        expect(pass.uniforms.uReticleCenter!.value.y).toBeCloseTo((ray.y + 1) / 2);
        expect(frame.reticleCenter[1]).not.toBeCloseTo(frame.center[1]);
        expect(insideLensAperture(frame.reticleCenter, frame, frame.aperture)).toBe(true);
        centers.push([...frame.center]);
      }
      expect(centers[0]).not.toEqual(centers[1]);
    } finally {
      lens.dispose();
      pass.dispose();
      f.dispose();
    }
  },
);

it('exported near frame stays visible while only the length housing hides in ADS and restores on exit', async () => {
  const f = await fixture();
  const scene = new Scene();
  f.view.configureOpticsSpike(scene, 'world', 'relief');
  const definition = f.registry.models.get('optic_holographic')!;
  const bytes = readFileSync(new URL(`../src/content/base/${definition.file}`, import.meta.url));
  const { scene: optic } = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, '');
  const meshes: Mesh[] = [];
  optic.traverse((object) => {
    if (object instanceof Mesh) {
      meshes.push(object);
    }
  });
  const hood = meshes.filter((mesh) => mesh.geometry.userData.piece === 'optic-ads-housing');
  const frame = meshes.filter((mesh) => mesh.geometry.userData.piece === 'optic-near-frame');
  const body = meshes.filter((mesh) => !mesh.geometry.userData.piece);
  const handling = { firearms: [], readiness: { uid: f.item.uid, progress: 1, aimingDownSights: false } };
  try {
    expect(hood.length).toBeGreaterThan(0);
    expect(frame.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
    f.view.update(f.camera, f.pose, 0, handling);
    scene.getObjectByName('held-item-right')!.add(optic);
    for (const [progress, aimingDownSights] of [
      [0, false],
      [1, false],
      [1, true],
      [1, false],
      [0, false],
    ] as const) {
      f.view.update(f.camera, f.pose, 0, { ...handling, readiness: { uid: f.item.uid, progress, aimingDownSights } });
      for (const mesh of hood) {
        expect(mesh.visible).toBe(!aimingDownSights);
      }
      for (const mesh of [...frame, ...body]) {
        expect(mesh.visible).toBe(true);
      }
    }
  } finally {
    f.dispose();
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.dispose();
      }
    }
  }
});

it.each(['disc', 'none'] as const)('tube=%s selects unity world replacement independently of power', async (tube) => {
  const f = await fixture(true, '?loadout=ar&optic=optic_lpvo_1_6x');
  vi.stubGlobal('location', { search: `?optics=world&eye=relief&tube=${tube}` });
  try {
    const scene = new Scene();
    configureOpticsSpike(f.view, scene, f.camera);
    const optic = mountedOptic(f.registry, f.item)!;
    const range = optic.model.gun!.attachment!.properties.magnification!;
    const handling = { firearms: [], readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true } };
    f.view.update(f.camera, f.pose, 0, handling);
    for (const magnification of [range.min, range.max]) {
      f.view.update(f.camera, f.pose, 0, {
        ...handling,
        opticZoom: { uid: f.item.uid, opticUid: optic.uid, magnification },
      });
      expect(f.view.opticLensFrame!.worldAtUnity).toBe(tube === 'disc');
    }
  } finally {
    vi.unstubAllGlobals();
    f.dispose();
  }
});

it('optic ADS hides the owner-view gun and supplies its window without hiding the world gun', async () => {
  const f = await fixture();
  try {
    expect(mountedOptic(f.registry, f.item)).toBeDefined();
    const handling = { firearms: [], readiness: { uid: f.item.uid, progress: 1, aimingDownSights: true } };
    f.update(f.camera, f.pose, 0, handling);
    expect(f.view.opticLensFrame).toBeDefined();
    const viewGun = f.view.warmUpTarget.scene.getObjectByName('held-item-right')!;
    const worldGun = f.physical().getObjectByName('held-item-right')!;
    expect(viewGun.visible).toBe(false);
    expect(worldGun.visible).toBe(true);
    f.update(f.camera, f.pose, 0, { ...handling, readiness: { ...handling.readiness, aimingDownSights: false } });
    expect(f.view.opticLensFrame).toBeUndefined();
    expect(viewGun.visible).toBe(true);
    expect(worldGun.visible).toBe(true);
  } finally {
    f.dispose();
  }
});
