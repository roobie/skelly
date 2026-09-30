import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  Box3,
  BoxGeometry,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { type MeleeProfile, meleePoseAndContact } from '../src/core/meleePose.ts';
import { HeldItems } from '../src/render/hands.ts';
import { type ModelLibrary, prepareModel } from '../src/render/models.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const { palette } = registry.figures.get('player')!;

const modelLibrary = (overrides: Readonly<Record<string, string>> = {}): ModelLibrary => {
  const prepared = new Map<string, Object3D>();
  for (const def of registry.models.values()) {
    const gripX = def.grip?.at[0] ?? 0;
    const tipX = def.anchors?.strike?.[0] ?? gripX + 0.35;
    const minX = Math.min(gripX, tipX);
    const maxX = Math.max(gripX, tipX);
    const mesh = new Mesh(new BoxGeometry(Math.max(0.03, maxX - minX), 0.06, 0.06), new MeshLambertMaterial());
    mesh.position.x = (minX + maxX) / 2;
    prepared.set(def.id, prepareModel(def, mesh).held);
  }
  return {
    version: 0,
    held: (id: string) => prepared.get(overrides[id] ?? id)?.clone(),
  } as unknown as ModelLibrary;
};

const screen = (point: Vector3, camera: PerspectiveCamera): { x: number; y: number } => {
  const ndc = point.clone().project(camera);
  return { x: ((ndc.x + 1) * 1920) / 2, y: ((1 - ndc.y) * 1080) / 2 };
};
const boxCorners = (box: Box3): Vector3[] =>
  [box.min.x, box.max.x].flatMap((x) =>
    [box.min.y, box.max.y].flatMap((y) => [box.min.z, box.max.z].map((z) => new Vector3(x, y, z))),
  );

interface HeldInternals {
  view: import('three').Group;
  arms: Map<'left' | 'right', import('three').Group>;
  heldByHand: Map<'left' | 'right', import('three').Object3D>;
}

interface MotionSample {
  tip: Vector3;
  hand: Vector3;
  elapsed: number;
  minPalmDepth: number;
  palmArea: number;
  itemOrientation?: Quaternion;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: samples a full rendered-hand trajectory for per-frame safety and profile extents.
const measure = (profile: MeleeProfile, itemId: string | undefined, modelOverride?: string) => {
  const inventory = new Inventory(registry);
  const item = itemId ? inventory.create(itemId) : undefined;
  if (item) {
    inventory.add(item, { kind: 'hand', side: 'right' });
  }
  const modelId = item ? registry.items.get(item.type)?.model : undefined;
  const modelOverrides = modelId && modelOverride ? { [modelId]: modelOverride } : {};
  const held = new HeldItems(inventory, modelLibrary(modelOverrides), palette);
  const internals = held as unknown as HeldInternals;
  const camera = new PerspectiveCamera(75, 16 / 9, 0.01, 128);
  camera.rotation.order = 'YXZ';
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const def = item ? registry.items.get(item.type)! : undefined;
  const action = {
    profile,
    hand: 'right' as const,
    twoHanded: def?.twoHanded ?? false,
    cooldown: 1.2,
    contactAt: 0.25,
    aimYaw: 0,
    aimPitch: 0,
    origin: [0, 0, 0] as [number, number, number],
    direction: [0, 0, -1] as [number, number, number],
    hitResolved: false,
  };
  const samples: MotionSample[] = [];
  for (let step = 0; step <= 120; step++) {
    const elapsed = (action.cooldown * step) / 120;
    held.update(camera, meleePoseAndContact(action, elapsed, false));
    internals.view.updateMatrixWorld(true);
    const arm = internals.arms.get('right')!;
    const hand = arm.getObjectByName('grip-anchor')!.getWorldPosition(new Vector3());
    const palm = arm.children[2]!;
    const palmCorners = boxCorners(new Box3().setFromObject(palm));
    const palmDepths = palmCorners.map((point) => -camera.worldToLocal(point.clone()).z);
    const palmPixels = palmCorners.map((point) => screen(point, camera));
    const palmWidth = Math.max(...palmPixels.map(({ x }) => x)) - Math.min(...palmPixels.map(({ x }) => x));
    const palmHeight = Math.max(...palmPixels.map(({ y }) => y)) - Math.min(...palmPixels.map(({ y }) => y));
    let tip: Vector3;
    if (item) {
      tip = new Vector3();
      if (!held.lensOf(item, camera, tip)) {
        throw new Error(`Held item ${item.type} did not expose its tip/lens`);
      }
    } else {
      tip = hand.clone();
    }
    const itemGroup = internals.heldByHand.get('right');
    samples.push({
      tip,
      hand,
      elapsed,
      minPalmDepth: Math.min(...palmDepths),
      palmArea: (palmWidth * palmHeight) / (1920 * 1080),
      ...(itemGroup ? { itemOrientation: itemGroup.getWorldQuaternion(new Quaternion()) } : {}),
    });
  }
  const pixels = samples.map(({ tip }) => screen(tip, camera));
  const xs = pixels.map(({ x }) => x);
  let diagonal = 0;
  for (const from of pixels) {
    for (const to of pixels) {
      diagonal = Math.max(diagonal, Math.hypot(to.x - from.x, to.y - from.y));
    }
  }
  const contact = samples.find(({ elapsed }) => Math.abs(elapsed - action.contactAt) < 1e-8)!;
  const pullback = samples.find(({ elapsed }) => Math.abs(elapsed - 0.08) < 1e-8)!;
  const follow = samples.find(({ elapsed }) => Math.abs(elapsed - 0.46) < 1e-8)!;
  const depth = (point: Vector3) => -camera.worldToLocal(point.clone()).z;
  const pixelDistance = (a: Vector3, b: Vector3) => {
    const first = screen(a, camera);
    const second = screen(b, camera);
    return Math.hypot(first.x - second.x, first.y - second.y);
  };
  const pullToContactRotationDegrees =
    pullback.itemOrientation && contact.itemOrientation
      ? pullback.itemOrientation.angleTo(contact.itemOrientation) * (180 / Math.PI)
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
    minPalmDepth: Math.min(...samples.map(({ minPalmDepth }) => minPalmDepth)),
    palmAreaAtContact: contact.palmArea,
    pullToContactRotationDegrees,
  };
};

describe('melee screen-space motion through HeldItems and the 75-degree first-person camera at 1920x1080', () => {
  it('sweeps blunt tips at least 45% of the viewport width and rotates the weapon through 90 degrees', () => {
    for (const item of ['baseball_bat', 'steel_pipe']) {
      const result = measure('blunt', item);
      expect(result.horizontal).toBeGreaterThanOrEqual(860);
      expect(result.pullToContactRotationDegrees).toBeGreaterThanOrEqual(90);
      expect(result.tipCenterAtContact).toBeLessThanOrEqual(350);
    }
  });

  it('slashes cut tips at least 35% of the viewport diagonal from upper weapon side to lower opposite side', () => {
    for (const item of ['kitchen_knife', 'machete']) {
      const result = measure('cut', 'kitchen_knife', item === 'kitchen_knife' ? undefined : item);
      expect(result.diagonal).toBeGreaterThanOrEqual(Math.hypot(1920, 1080) * 0.35);
      expect(result.tipCenterAtContact).toBeLessThanOrEqual(350);
      expect(result.pullbackTipScreen.x).toBeGreaterThan(960);
      expect(result.pullbackTipScreen.y).toBeLessThan(540);
      expect(result.followTipScreen.x).toBeLessThan(960);
      expect(result.followTipScreen.y).toBeGreaterThan(540);
    }
  });

  it('thrusts pierce tips forward by 0.35 m and visibly shrinks them toward screen centre', () => {
    for (const modelOverride of [undefined, 'kabar']) {
      const result = measure('pierce', 'steel_pipe', modelOverride);
      expect(result.forward).toBeGreaterThanOrEqual(0.35);
      expect(result.projectedLengthAtContact).toBeLessThan(result.projectedLengthAtPullback * 0.8);
      expect(result.tipCenterAtContact).toBeLessThanOrEqual(300);
    }
  });

  it('jabs fists forward by 0.3 m and ends at screen centre', () => {
    const result = measure('fists', undefined);
    expect(result.forward).toBeGreaterThanOrEqual(0.3);
    expect(result.handCenterAtContact).toBeLessThanOrEqual(120);
  });

  it('keeps every palm beyond the near plane and below 40% of the view at contact', () => {
    for (const [profile, item, modelOverride] of [
      ['blunt', 'baseball_bat', undefined],
      ['cut', 'kitchen_knife', 'machete'],
      ['pierce', 'steel_pipe', 'kabar'],
      ['fists', undefined, undefined],
    ] as const) {
      const result = measure(profile, item, modelOverride);
      expect(result.minPalmDepth, `${profile} hand must stay in front of the near plane`).toBeGreaterThan(0.01);
      expect(result.palmAreaAtContact, `${profile} hand coverage at contact`).toBeLessThanOrEqual(0.4);
    }
  });
});
