import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Group, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldAnchorOffset } from '../src/core/heldPose.ts';
import { Inventory } from '../src/core/inventory.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { rackCant } from '../src/render/firearmModel.ts';
import { HeldItems } from '../src/render/hands.ts';
import type { ModelLibrary } from '../src/render/models.ts';

it('rack pose turns an away-facing port only during handling without changing game state', () => {
  const base = 'src/content/base';
  const { registry, issues } = buildRegistry(
    readdirSync(base)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
  );
  expect(issues).toEqual([]);
  const model = structuredClone(registry.models.get('shotgun_pump')!);
  // Own this geometry/timeline fixture, not the evolving export's side or tuning.
  model.grip = { at: [0, 0, 0], turn: [0, 0, 0] };
  model.roll = 0;
  model.hold = undefined;
  model.anchors = { ...model.anchors, ejection: [0, 0.04, 0.02] };
  model.anchors.loading_port = [0, -0.02, 0];
  model.action!.hand = { durationSeconds: 1.2, rearwardSeconds: 0.4, dwellSeconds: 0.3, forwardSeconds: 0.5 };
  const content = { ...registry, models: new Map(registry.models).set(model.id, model) };
  const inventory = new Inventory(content);
  const gun = inventory.create('pump_shotgun');
  expect(inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
  const queue = new HandlingQueue(inventory);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: 0.5,
    pose: () => undefined,
    onEjection: () => undefined,
  });
  const models = {
    version: 0,
    held: () => {
      const root = new Group();
      root.name = 'rack-pose-probe';
      return { root, parts: [] };
    },
  } as unknown as ModelLibrary;
  const held = new HeldItems(inventory, models, registry.figures.get('player')!.palette);
  const camera = new PerspectiveCamera();
  const state = () =>
    structuredClone({
      inventory: inventory.snapshotState(),
      firearm: gun.firearm,
      jobs: queue.jobs,
      version: inventory.version,
      model,
    });
  const update = () => {
    const before = state();
    held.update(camera, undefined, 0, { firearms: mechanics.frames() });
    expect(state()).toEqual(before);
    return held.warmUpTarget.scene.getObjectByName('rack-pose-probe')!.getWorldQuaternion(new Quaternion());
  };
  const rest = update();
  expect(mechanics.cock(gun.uid, 0)).toBeUndefined();
  expect(update().angleTo(rest)).toBeCloseTo(0);
  const halfway = model.action!.hand.rearwardSeconds + model.action!.hand.dwellSeconds / 2;
  queue.tick(halfway);
  mechanics.advanceTo(halfway);
  const rotated = update();
  expect(rotated.angleTo(rest)).toBeGreaterThan(0);
  const position = held.warmUpTarget.scene.getObjectByName('rack-pose-probe')!.getWorldPosition(new Vector3());
  const port = new Vector3(...heldAnchorOffset(model, 'ejection')).applyQuaternion(rotated).add(position);
  const face = new Vector3(1, 0, 0).applyQuaternion(rotated);
  expect(face.dot(camera.getWorldPosition(new Vector3()).sub(port))).toBeGreaterThan(0);
  const frame = mechanics.frames()[0]!;
  expect(rackCant(model, 'left', frame, position)).toBe(0); // same port already faces this hand's view
  const oppositePort = {
    ...model,
    anchors: { ...model.anchors, ejection: [0, 0.04, -0.02] as [number, number, number] },
  };
  expect(rackCant(oppositePort, 'right', frame, position)).toBe(0);
  expect(rackCant(oppositePort, 'left', frame, { x: -position.x, y: position.y })).toBeLessThan(0); // sign is not hard-coded
  expect(rackCant(model, 'right', { ...frame, mode: 'load' }, position)).toBe(0);
  expect(rackCant(model, 'right', { ...frame, mode: 'fire' }, position)).toBe(0);
  queue.cancel();
  mechanics.advanceTo(halfway);
  expect(update().angleTo(rest)).toBeCloseTo(0);
  expect(mechanics.cock(gun.uid, 2)).toBeUndefined();
  queue.tick(model.action!.hand.durationSeconds);
  mechanics.advanceTo(2 + model.action!.hand.durationSeconds);
  expect(update().angleTo(rest)).toBeCloseTo(0);
});
