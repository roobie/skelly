import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CircleGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { compassBearing } from '../src/core/coords.ts';
import { actionCycleSeconds } from '../src/core/firearmAction.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { FirearmMechanics, firearmHandlingFor } from '../src/game/firearmHandling.ts';
import { Unpacking } from '../src/game/unpacking.ts';
import { type HeldHandlingFrame, HeldItems } from '../src/render/hands.ts';
import type { ModelLibrary } from '../src/render/models.ts';
import { RUMMAGE_POSE, rummageFrame } from '../src/render/rummagePose.ts';

afterEach(() => vi.unstubAllGlobals());

const base = 'src/content/base';
const { registry, issues } = buildRegistry([
  ...readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
  {
    source: 'rummage-fixture.json',
    data: {
      items: [
        {
          id: 'fixture_package',
          name: 'Fixture package',
          category: 'misc',
          weight: 50,
          size: [2, 2],
          unpack: { item: 'fixture_payload', count: 3 },
        },
        { id: 'fixture_payload', name: 'Fixture payload', category: 'misc', weight: 10, size: [1, 1], stack: 7 },
        {
          id: 'fixture_twohanded',
          name: 'Fixture two-handed item',
          category: 'misc',
          weight: 100,
          size: [2, 3],
          twoHanded: true,
        },
      ],
    },
  },
]);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

const fixture = (type: string, checkState: (before: unknown, after: unknown) => void, content: Registry = registry) => {
  const inventory = new Inventory(content);
  const item = inventory.create(type);
  if (!inventory.add(item, { kind: 'hand', side: 'right' })) {
    throw new Error('Cannot hold fixture item');
  }
  const queue = new HandlingQueue(inventory);
  const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0]);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: 0.5,
    pose: () => undefined,
    onEjection: () => undefined,
  });
  const models = { version: 0, held: () => ({ root: new Group(), parts: [] }) } as unknown as ModelLibrary;
  const held = new HeldItems(inventory, models, { skin: '#bbaa99', shirt: '#556677', trousers: '#334455' });
  const camera = new PerspectiveCamera();
  const project = (handling: HeldHandlingFrame = { firearms: mechanics.frames(), job: queue.jobs[0] }) => {
    const before = structuredClone({
      inventory: inventory.snapshotState(),
      jobs: queue.jobs,
      version: inventory.version,
    });
    held.update(camera, undefined, 0, handling);
    checkState(before, { inventory: inventory.snapshotState(), jobs: queue.jobs, version: inventory.version });
    const { scene } = held.warmUpTarget;
    const wrists = (['right', 'left'] as const).map((side) => {
      const arm = scene.getObjectByName(`first-person-arm-${side}`);
      const anchor = arm?.getObjectByName('grip-anchor');
      if (!anchor) {
        throw new Error(`Missing fixture wrist: ${side}`);
      }
      return anchor.getWorldPosition(new Vector3());
    });
    return { wrists, separation: wrists[0]!.distanceTo(wrists[1]!) };
  };
  return { inventory, item, queue, unpacking, mechanics, project, camera, held };
};

it('held unpacking converges without mutating game state and returns after completion or cancellation', () => {
  const f = fixture('fixture_package', (before, after) => expect(after).toEqual(before));
  const rest = f.project();
  expect(f.unpacking.activate(f.item)).toBeUndefined();
  f.queue.tick(f.queue.remaining / 2);
  const working = f.project();
  expect(working.separation).toBeLessThan(rest.separation);
  for (let side = 0; side < rest.wrists.length; side++) {
    expect(working.wrists[side]!.distanceTo(rest.wrists[side]!)).toBeGreaterThan(0);
  }
  f.queue.cancel();
  expect(f.project().wrists).toEqual(rest.wrists);
  expect(f.unpacking.activate(f.item)).toBeUndefined();
  f.queue.tick(f.queue.remaining / 2);
  expect(f.project().separation).toBeLessThan(rest.separation);
  expect(f.queue.tick(f.queue.remaining).failed).toEqual([]);
  expect(f.inventory.itemByUid(f.item.uid)).toBeUndefined();
  expect(f.project().wrists).toEqual(rest.wrists);
});

it('a cancelled two-handed move restores the support arm local baseline', () => {
  const f = fixture('fixture_twohanded', (before, after) => expect(after).toEqual(before));
  const rest = f.project();
  expect(f.queue.enqueue(f.item, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
  f.queue.tick(f.queue.remaining / 2);
  expect(f.project().separation).toBeLessThan(rest.separation);
  f.queue.cancel();
  expect(f.project().wrists).toEqual(rest.wrists);
});

it('a pickup does not rummage before its source item is held', () => {
  const f = fixture('fixture_twohanded', (before, after) => expect(after).toEqual(before));
  expect(f.inventory.move(f.item, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
  const rest = f.project();
  expect(f.queue.enqueue(f.item, { kind: 'hand', side: 'right' }).ok).toBe(true);
  f.queue.tick(f.queue.remaining / 2);
  expect(f.project().wrists).toEqual(rest.wrists);
});

it('a dedicated cock job is ineligible for rummage independently of live firearm frames', () => {
  const gunDef = [...registry.items.values()].find((def) => def.firearm?.pump);
  expect(gunDef).toBeDefined();
  const f = fixture(gunDef!.id, (before, after) => expect(after).toEqual(before));
  expect(f.mechanics.cock(f.item.uid, 0)).toBeUndefined();
  f.queue.tick(f.queue.remaining / 2);
  f.mechanics.advanceTo(f.queue.jobs[0]!.elapsed);
  expect(f.mechanics.frames().some((frame) => frame.uid === f.item.uid && frame.mode === 'hand')).toBe(true);
  expect(rummageFrame(f.inventory, f.queue.jobs[0], 'right')).toBeUndefined();
  f.project();
});

it('a live firearm pose takes precedence over a generic held move', () => {
  const gunDef = [...registry.items.values()].find(
    (def) => def.firearm && !def.firearm.pump && def.model && registry.models.get(def.model)?.action?.fire,
  );
  expect(gunDef).toBeDefined();
  const f = fixture(gunDef!.id, (before, after) => expect(after).toEqual(before));
  expect(
    f.mechanics.fire({
      debugMode: true,
      item: f.item,
      simTime: 0,
      seed: 7,
      eye: [0, 3, 0],
      feet: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      blockSize: 0.5,
    }),
  ).toBe(true);
  expect(f.queue.enqueue(f.item, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
  const step = Math.min(f.queue.remaining, actionCycleSeconds(firearmHandlingFor(f.item, registry).action, 'fire')) / 4;
  f.queue.tick(step);
  f.mechanics.advanceTo(step);
  expect(f.mechanics.frames().some((frame) => frame.uid === f.item.uid && frame.mode === 'fire')).toBe(true);
  expect(rummageFrame(f.inventory, f.queue.jobs[0], 'right')?.weight).toBeGreaterThan(0);
  const dedicated = f.project({ firearms: f.mechanics.frames() });
  expect(f.project().wrists).toEqual(dedicated.wrists);
});

it('compass rummage starts from its raised grip, keeps the device attached and follows camera north', () => {
  // A canvas protocol fixture observes Three transforms, not rendered pixels.
  const context = { fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), stroke: vi.fn() };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
  const content = buildRegistry([
    {
      source: 'compass-rummage-fixture.json',
      data: { items: [{ id: 'compass', name: 'Fixture compass', category: 'misc', weight: 17, size: [1, 1] }] },
    },
  ]);
  expect(content.issues).toEqual([]);
  const f = fixture('compass', (before, after) => expect(after).toEqual(before), content.registry);
  expect(f.inventory.move(f.item, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
  const empty = f.project();
  expect(f.inventory.move(f.item, { kind: 'hand', side: 'right' }).ok).toBe(true);
  const rest = f.project();
  expect(rest.wrists[0]!.y).toBeGreaterThan(empty.wrists[0]!.y);
  let pointer: Mesh | undefined;
  f.held.warmUpTarget.scene.traverse((object) => {
    if (object instanceof Mesh && object.geometry instanceof CircleGeometry) {
      pointer = object;
    }
  });
  expect(pointer).toBeDefined();
  const device = pointer!.parent!;
  const viewLocal = (position: Vector3) => position.clone().applyQuaternion(f.camera.quaternion.clone().invert());
  const attachment = (wrist: Vector3) => viewLocal(device.getWorldPosition(new Vector3()).sub(wrist));
  const restAttachment = attachment(rest.wrists[0]!);
  expect(f.queue.enqueue(f.item, { kind: 'pile', pos: [2, 0, 0] }).ok).toBe(true);
  f.queue.tick(Math.min(f.queue.remaining / 8, RUMMAGE_POSE.transitionSeconds / 4));
  f.camera.rotation.y = -Math.PI / 3;
  const first = f.project();
  expect(first.separation).toBeLessThan(rest.separation);
  const firstWeight = rummageFrame(f.inventory, f.queue.jobs[0], 'right')!.weight;
  expect(firstWeight).toBeGreaterThan(0);
  expect(firstWeight).toBeLessThan(1);
  expect(attachment(first.wrists[0]!).distanceTo(restAttachment)).toBeLessThan(1e-12);
  expect(pointer!.rotation.z).toBeCloseTo(compassBearing(f.camera.rotation.y) * (Math.PI / 180), 12);
  const firstGrip = viewLocal(first.wrists[0]!);
  f.queue.tick(Math.min(f.queue.remaining / 4, RUMMAGE_POSE.transitionSeconds / 4));
  f.camera.rotation.y = Math.PI / 7;
  const second = f.project();
  const secondWeight = rummageFrame(f.inventory, f.queue.jobs[0], 'right')!.weight;
  expect(secondWeight).toBeGreaterThan(firstWeight);
  expect(attachment(second.wrists[0]!).distanceTo(restAttachment)).toBeLessThan(1e-12);
  expect(pointer!.rotation.z).toBeCloseTo(compassBearing(f.camera.rotation.y) * (Math.PI / 180), 12);
  const secondGrip = viewLocal(second.wrists[0]!);
  // X has no wave: each weighted displacement must start at the observed raised grip.
  expect((firstGrip.x - rest.wrists[0]!.x) / firstWeight).toBeCloseTo(
    (secondGrip.x - rest.wrists[0]!.x) / secondWeight,
    12,
  );
  f.queue.cancel();
  expect(viewLocal(f.project().wrists[0]!).distanceTo(rest.wrists[0]!)).toBeLessThan(1e-12);
  f.held.dispose();
});
