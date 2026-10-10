import { readFileSync } from 'node:fs';
import { Box3, LoadingManager, PerspectiveCamera, Quaternion, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { type MeleeProfile, meleeContactTime, meleePoseAndContact, readyMeleePose } from '../src/core/meleePose.ts';
import { FISTS_MELEE } from '../src/core/zombies.ts';
import { HeldItems } from '../src/render/hands.ts';
import type { ItemLook } from '../src/render/itemLook.ts';
import { type ModelLibrary, prepareModel } from '../src/render/models.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  Object.keys(import.meta.glob('../src/content/base/*.json', { eager: true })).map((file) => ({
    source: file,
    data: JSON.parse(readFileSync(file.replace('../', ''), 'utf8')) as unknown,
  })),
);
const { palette } = registry.figures.get('player')!;
Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });
const gltfLoader = new GLTFLoader(new LoadingManager());
gltfLoader.register(() => ({ name: 'audit-textures', loadTexture: () => Promise.resolve(new Texture()) }));
const realHeldModels = new Map<string, import('three').Object3D>();
await Promise.all(
  ['baseball_bat', 'steel_pipe', 'kitchen_knife', 'machete', 'kabar'].map(async (id) => {
    const def = registry.models.get(id)!;
    const bytes = readFileSync(`${BASE}/${def.file}`);
    const gltf = await gltfLoader.parseAsync(Uint8Array.from(bytes).buffer, '');
    realHeldModels.set(id, prepareModel(def, gltf.scene).held);
  }),
);
const heldModel = (id: string) => {
  const root = realHeldModels.get(id)?.clone();
  return root ? { root, parts: [] } : undefined;
};
const library: ModelLibrary = {
  version: 0,
  held: heldModel,
  heldLook: (look: ItemLook) => {
    const model = heldModel(look.model);
    return model && { ...model, slots: {} };
  },
} as unknown as ModelLibrary;
const screen = (point: Vector3, camera: PerspectiveCamera): { x: number; y: number } => {
  const ndc = point.clone().project(camera);
  return { x: ((ndc.x + 1) * 1920) / 2, y: ((1 - ndc.y) * 1080) / 2 };
};
const boxCorners = (box: Box3): Vector3[] =>
  [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) => [box.min.z, box.max.z].map((z) => new Vector3(x, y, z))),
  );
const weaponRollDegrees = (rest: Quaternion, current: Quaternion): number => {
  const restLong = new Vector3(1, 0, 0).applyQuaternion(rest).normalize();
  const currentLong = new Vector3(1, 0, 0).applyQuaternion(current).normalize();
  const restEdge = new Vector3(0, 1, 0).applyQuaternion(rest).normalize();
  const currentEdge = new Vector3(0, 1, 0).applyQuaternion(current).normalize();
  const swing = new Quaternion().setFromUnitVectors(restLong, currentLong);
  const expectedEdge = restEdge.applyQuaternion(swing);
  const sin = currentLong.dot(expectedEdge.clone().cross(currentEdge));
  return Math.abs(Math.atan2(sin, expectedEdge.dot(currentEdge))) * (180 / Math.PI);
};

interface HeldInternals {
  view: import('three').Group;
  arms: Map<'left' | 'right', import('three').Group>;
  heldByHand: Map<'left' | 'right', import('three').Object3D>;
}
interface MotionSample {
  tip: Vector3;
  hand: Vector3;
  elapsed: number;
  orientation?: Quaternion;
}
interface MotionResult {
  horizontal: number;
  diagonal: number;
  forward: number;
  projectedLengthAtPullback: number;
  projectedLengthAtContact: number;
  tipCenterAtContact: number;
  handCenterAtContact: number;
  pullbackTipScreen: { x: number; y: number };
  followTipScreen: { x: number; y: number };
  torsoYawAtContactDegrees: number;
  maxTorsoYawDegrees: number;
  cameraOrientationChange: number;
  pullToContactRotationDegrees: number;
  maxWeaponRollDegrees: number;
  minPalmDepth: number;
  palmAreaAtContact: Readonly<Record<'left' | 'right', number>>;
  maxPalmArea: Readonly<Record<'left' | 'right', number>>;
  tipStaysInViewport: boolean;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: measures real loaded models and every rendered palm across one full action.
function measure(
  profile: MeleeProfile,
  itemId: string | undefined,
  modelOverride: string | undefined,
  side: 'right' | 'left',
): MotionResult {
  const inventory = new Inventory(registry);
  const item = itemId ? inventory.create(itemId) : undefined;
  if (item) {
    inventory.add(item, { kind: 'hand', side });
  }
  const def = item ? registry.items.get(item.type)! : undefined;
  const modelId = def?.model;
  const models: ModelLibrary =
    modelId && modelOverride
      ? ({
          ...library,
          heldLook: (look: ItemLook) =>
            library.heldLook({ ...look, model: look.model === modelId ? modelOverride : look.model }),
        } as ModelLibrary)
      : library;
  const held = new HeldItems(inventory, models, palette);
  const internals = held as unknown as HeldInternals;
  const camera = new PerspectiveCamera(75, 16 / 9, 0.01, 128);
  camera.rotation.order = 'YXZ';
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const cooldown = def?.weapon?.melee?.cooldownSimSeconds ?? FISTS_MELEE.cooldown;
  const contactAt = meleeContactTime(cooldown);
  const pullTime = contactAt * 0.32;
  const followTime = contactAt + (cooldown - contactAt) * 0.22;
  const action = {
    profile,
    hand: side,
    twoHanded: def?.twoHanded ?? false,
    cooldown,
    contactAt,
    aimYaw: 0,
    aimPitch: 0,
    origin: [0, 0, 0] as [number, number, number],
    direction: [0, 0, -1] as [number, number, number],
    hitResolved: false,
  };
  const sampleTimes = [
    ...new Set([...Array.from({ length: 121 }, (_, step) => (cooldown * step) / 120), pullTime, contactAt, followTime]),
  ].sort((a, b) => a - b);
  held.update(camera, readyMeleePose(true));
  internals.view.updateMatrixWorld(true);
  const weaponTransform = internals.heldByHand.get(side)?.children[0];
  const restOrientation = weaponTransform?.getWorldQuaternion(new Quaternion());
  const samples: MotionSample[] = [];
  let minPalmDepth = Number.POSITIVE_INFINITY;
  let maxTorsoYawRadians = 0;
  let cameraOrientationChange = 0;
  let torsoYawAtContactRadians = 0;
  let maxWeaponRollDegrees = 0;
  const palmAreaAtContact: Record<'left' | 'right', number> = { left: 0, right: 0 };
  const maxPalmArea: Record<'left' | 'right', number> = { left: 0, right: 0 };
  for (const elapsed of sampleTimes) {
    const pose = meleePoseAndContact(action, elapsed, false);
    const cameraBefore = camera.quaternion.clone();
    held.update(camera, pose);
    cameraOrientationChange = Math.max(cameraOrientationChange, cameraBefore.angleTo(camera.quaternion));
    maxTorsoYawRadians = Math.max(maxTorsoYawRadians, Math.abs(pose.torsoYaw ?? 0));
    if (Math.abs(elapsed - contactAt) < 1e-8) {
      torsoYawAtContactRadians = pose.torsoYaw ?? 0;
    }
    internals.view.updateMatrixWorld(true);
    const primaryArm = internals.arms.get(side)!;
    const hand = primaryArm.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
    const tip = item ? new Vector3() : hand.clone();
    if (item && !held.lensOf(item, tip)) {
      throw new Error(`Held ${item.type} did not expose its real GLB lens`);
    }
    const atContact = Math.abs(elapsed - contactAt) < 1e-8;
    const orientation = weaponTransform?.getWorldQuaternion(new Quaternion());
    if (orientation && restOrientation) {
      maxWeaponRollDegrees = Math.max(maxWeaponRollDegrees, weaponRollDegrees(restOrientation, orientation));
    }
    for (const [armSide, arm] of internals.arms) {
      const palm = arm.children[2]!;
      const corners = boxCorners(new Box3().setFromObject(palm));
      const depths = corners.map((point) => -camera.worldToLocal(point.clone()).z);
      minPalmDepth = Math.min(minPalmDepth, ...depths);
      const projected = corners.map((point) => screen(point, camera));
      // Palm coverage is limited to pixels inside the actual 1920x1080 viewport.
      const left = Math.max(0, Math.min(...projected.map(({ x }) => x)));
      const right = Math.min(1920, Math.max(...projected.map(({ x }) => x)));
      const top = Math.max(0, Math.min(...projected.map(({ y }) => y)));
      const bottom = Math.min(1080, Math.max(...projected.map(({ y }) => y)));
      const area = (Math.max(0, right - left) * Math.max(0, bottom - top)) / (1920 * 1080);
      if (area > maxPalmArea[armSide]) {
        maxPalmArea[armSide] = area;
      }
      if (atContact) {
        palmAreaAtContact[armSide] = area;
      }
    }
    samples.push({
      tip,
      hand,
      elapsed,
      ...(orientation ? { orientation } : {}),
    });
  }
  const pixels = samples.map(({ tip }) => screen(tip, camera));
  const xs = pixels.map(({ x }) => x);
  const tipStaysInViewport = pixels.every(({ x, y }) => x >= 0 && x <= 1920 && y >= 0 && y <= 1080);
  let diagonal = 0;
  for (const from of pixels) {
    for (const to of pixels) {
      diagonal = Math.max(diagonal, Math.hypot(to.x - from.x, to.y - from.y));
    }
  }
  const contact = samples.find(({ elapsed }) => Math.abs(elapsed - contactAt) < 1e-8)!;
  const pullback = samples.find(({ elapsed }) => Math.abs(elapsed - pullTime) < 1e-8)!;
  const follow = samples.find(({ elapsed }) => Math.abs(elapsed - followTime) < 1e-8)!;
  const depth = (point: Vector3) => -camera.worldToLocal(point.clone()).z;
  const pixelDistance = (a: Vector3, b: Vector3) => {
    const first = screen(a, camera);
    const second = screen(b, camera);
    return Math.hypot(first.x - second.x, first.y - second.y);
  };
  const pullToContactRotationDegrees =
    pullback.orientation && contact.orientation
      ? pullback.orientation.angleTo(contact.orientation) * (180 / Math.PI)
      : 0;
  return {
    horizontal: Math.max(...xs) - Math.min(...xs),
    diagonal,
    forward: depth(contact.tip) - depth(pullback.tip),
    projectedLengthAtPullback: pixelDistance(pullback.tip, pullback.hand),
    projectedLengthAtContact: pixelDistance(contact.tip, contact.hand),
    tipCenterAtContact: pixelDistance(contact.tip, new Vector3(0, 0, -depth(contact.tip))),
    handCenterAtContact: pixelDistance(contact.hand, new Vector3(0, 0, -depth(contact.hand))),
    pullbackTipScreen: screen(pullback.tip, camera),
    followTipScreen: screen(follow.tip, camera),
    torsoYawAtContactDegrees: torsoYawAtContactRadians * (180 / Math.PI),
    maxTorsoYawDegrees: maxTorsoYawRadians * (180 / Math.PI),
    cameraOrientationChange,
    pullToContactRotationDegrees,
    maxWeaponRollDegrees,
    minPalmDepth,
    palmAreaAtContact,
    maxPalmArea,
    tipStaysInViewport,
  };
}

describe('melee screen-space motion through HeldItems, real GLBs and the 75-degree camera at 1920x1080', () => {
  it('sweeps blunt tips at least 45% of the viewport width and rotates weapons through 90 degrees', () => {
    for (const side of ['right', 'left'] as const) {
      for (const item of ['baseball_bat', 'steel_pipe']) {
        const result = measure('blunt', item, undefined, side);
        expect(result.horizontal, `${item}/${side}`).toBeGreaterThanOrEqual(860);
        expect(result.pullToContactRotationDegrees, `${item}/${side}`).toBeGreaterThanOrEqual(90);
        expect(result.tipCenterAtContact, `${item}/${side}`).toBeLessThanOrEqual(350);
      }
    }
  });

  it('slashes the real knife diagonally with forward push and centred contact in both hands', () => {
    for (const side of ['right', 'left'] as const) {
      const result = measure('cut', 'kitchen_knife', undefined, side);
      expect(result.diagonal, `kitchen_knife/${side}`).toBeGreaterThanOrEqual(Math.hypot(1920, 1080) * 0.35);
      expect(result.forward, `kitchen_knife/${side}, 893d0ca baseline -0.08089 m`).toBeGreaterThanOrEqual(0.069);
      expect(result.tipCenterAtContact, `kitchen_knife/${side}`).toBeLessThanOrEqual(350);
      expect(
        side === 'right' ? result.pullbackTipScreen.x > 960 : result.pullbackTipScreen.x < 960,
        `kitchen_knife/${side} upper-side start`,
      ).toBe(true);
      expect(result.pullbackTipScreen.y, `kitchen_knife/${side} start`).toBeLessThan(540);
      expect(
        side === 'right' ? result.followTipScreen.x < 960 : result.followTipScreen.x > 960,
        `kitchen_knife/${side} lower-opposite finish`,
      ).toBe(true);
      expect(result.followTipScreen.y, `kitchen_knife/${side} finish`).toBeGreaterThan(540);
    }
  });

  it('slashes the real machete through the viewport with centred contact in either hand', () => {
    for (const side of ['right', 'left'] as const) {
      const result = measure('cut', 'machete', undefined, side);
      expect(result.diagonal, side).toBeGreaterThanOrEqual(Math.hypot(1920, 1080) * 0.35);
      expect(result.forward, side).toBeGreaterThanOrEqual(0.069);
      expect(result.tipCenterAtContact, side).toBeLessThanOrEqual(350);
      expect(result.tipStaysInViewport, side).toBe(true);
    }
  });

  it('slashes the real Kabar with centred contact inside the viewport in either hand', () => {
    for (const side of ['right', 'left'] as const) {
      const result = measure('cut', 'kabar', undefined, side);
      expect(result.forward, side).toBeGreaterThanOrEqual(0.069);
      expect(result.tipCenterAtContact, side).toBeLessThanOrEqual(350);
      expect(result.tipStaysInViewport, side).toBe(true);
    }
  });

  it('thrusts the real steel pipe forward by 0.35 m and visibly shrinks it in either hand', () => {
    for (const side of ['right', 'left'] as const) {
      const result = measure('pierce', 'steel_pipe', undefined, side);
      expect(result.forward, side).toBeGreaterThanOrEqual(0.35);
      expect(result.projectedLengthAtContact, side).toBeLessThan(result.projectedLengthAtPullback * 0.8);
      expect(result.tipCenterAtContact, side).toBeLessThanOrEqual(300);
    }
  });

  it('jabs both fists forward by 0.3 m and ends at screen centre', () => {
    for (const side of ['right', 'left'] as const) {
      const result = measure('fists', undefined, undefined, side);
      expect(result.forward, side).toBeGreaterThanOrEqual(0.3);
      expect(result.handCenterAtContact, side).toBeLessThanOrEqual(120);
      expect(result.torsoYawAtContactDegrees * (side === 'right' ? 1 : -1), `${side} strike-side yaw`).toBeCloseTo(30);
      expect(result.maxTorsoYawDegrees, `${side} peak yaw`).toBeLessThanOrEqual(30);
      expect(result.cameraOrientationChange, `${side} camera yaw/pitch stays locked`).toBeLessThan(1e-8);
    }
  });

  it('keeps the blade edge within 10 degrees of its rest roll through the whole cut in either hand', () => {
    for (const item of ['machete', 'kabar', 'kitchen_knife']) {
      for (const side of ['right', 'left'] as const) {
        const result = measure('cut', item, undefined, side);
        expect(result.maxWeaponRollDegrees, `${item}/${side}, all 121 frames`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('keeps both rendered palms beyond the near plane and below 40% of the view at contact', () => {
    const profiles = [
      ['blunt', 'baseball_bat', undefined],
      ['cut', 'kitchen_knife', undefined],
      ['cut', 'machete', undefined],
      ['cut', 'kabar', undefined],
      ['pierce', 'steel_pipe', undefined],
      ['fists', undefined, undefined],
    ] as const;
    for (const [profile, item, model] of profiles) {
      for (const side of ['right', 'left'] as const) {
        const result = measure(profile, item, model, side);
        expect(result.minPalmDepth, `${profile}/${side} both hands`).toBeGreaterThan(0.01);
        for (const [armSide, area] of Object.entries(result.maxPalmArea)) {
          expect(area, `${profile}/${side} ${armSide} palm coverage over 121 frames`).toBeLessThanOrEqual(0.4);
        }
        for (const [armSide, area] of Object.entries(result.palmAreaAtContact)) {
          expect(area, `${profile}/${side} ${armSide} palm coverage at contact`).toBeLessThanOrEqual(0.4);
        }
      }
    }
  });
});
