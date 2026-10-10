import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldAnchorOffset } from '../src/core/heldPose.ts';
import { Inventory, SIDES } from '../src/core/inventory.ts';
import { FirearmMechanics } from '../src/game/firearmHandling.ts';
import { HeldItems } from '../src/render/hands.ts';
import type { ModelLibrary } from '../src/render/models.ts';

const base = 'src/content/base';
const { registry, issues } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

it('the physical support hand feeds a shell toward the port from the load job clock and resets without owning gameplay', () => {
  const definitions = [...registry.items.values()];
  const pump = definitions.find((definition) => definition.firearm?.pump && definition.model);
  const sourceModel = pump?.model ? registry.models.get(pump.model) : undefined;
  const ammo = definitions.find((definition) => definition.ammo?.calibre === sourceModel?.calibre && definition.model);
  const carrier = definitions.find((definition) => definition.wearable?.slot === 'back' && definition.container);
  const figure = [...registry.figures.values()].find((definition) => definition.palette);
  if (!(pump && sourceModel?.action && sourceModel.tube && ammo && carrier && figure)) {
    throw new Error('Missing load-pose fixture capabilities');
  }
  const model = structuredClone(sourceModel);
  model.id = 'load-fixture-gun-model';
  model.grip = { at: [0, 0, 0], turn: [0, 0, 0] };
  model.roll = 0;
  model.hold = undefined;
  model.anchors = { ...model.anchors, support: [0.3, 0, 0] };
  model.anchors.loading_port = [0, -0.03, 0];
  const content = {
    ...registry,
    models: new Map(registry.models).set(model.id, model),
    items: new Map(registry.items)
      .set('load-fixture-gun', { ...pump, id: 'load-fixture-gun', model: model.id, twoHanded: true })
      .set('load-fixture-shell', { ...ammo, id: 'load-fixture-shell', size: [1, 1] as [number, number], weight: 0.03 })
      .set('load-fixture-carrier', { ...carrier, id: 'load-fixture-carrier' }),
  };
  for (const holdingSide of SIDES) {
    // A left-slot gun on a right-dominant actor distinguishes placement from role preference.
    const character = new Character(content);
    const inventory = new Inventory(content, undefined, undefined, character);
    const gun = inventory.create('load-fixture-gun');
    const bag = inventory.create('load-fixture-carrier');
    const shells = inventory.create('load-fixture-shell', 2);
    expect(inventory.add(gun, { kind: 'hand', side: holdingSide })).toBe(true);
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    expect(inventory.add(shells, { kind: 'pocket', owner: bag, pocket: 0 })).toBe(true);
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const probeMesh = (name: string): Mesh => {
      const mesh = new Mesh();
      mesh.name = name;
      return mesh;
    };
    const models = {
      version: 0,
      held: () => {
        const root = new Group();
        root.name = 'load-shell-probe';
        root.add(probeMesh('load-shell-probe-mesh'));
        return { root, parts: [] };
      },
      heldLook: () => {
        const root = new Group();
        root.name = 'load-gun-probe';
        root.add(probeMesh('load-gun-probe-mesh'));
        return { root, parts: [], slots: {} };
      },
    } as unknown as ModelLibrary;
    const held = new HeldItems(inventory, models, figure.palette);
    const camera = new PerspectiveCamera();
    const supportSide = holdingSide === 'right' ? 'left' : 'right';
    const { scene } = held.warmUpTarget;
    const state = () =>
      structuredClone({
        inventory: inventory.snapshotState(),
        version: inventory.version,
        jobs: queue.jobs,
        character: character.snapshotState(),
        model,
      });
    const update = () => {
      const before = state();
      held.update(camera, undefined, 0, { firearms: mechanics.frames(), job: queue.jobs[0] });
      expect(state()).toEqual(before);
      const grip = scene.getObjectByName(`first-person-arm-${supportSide}`)?.getObjectByName('grip-anchor');
      const gunRoot = scene.getObjectByName('load-gun-probe');
      if (!(grip && gunRoot)) {
        throw new Error('Missing actual support/grip objects');
      }
      const port = gunRoot.localToWorld(new Vector3(...heldAnchorOffset(model, 'loading_port')));
      return { wrist: grip.getWorldPosition(new Vector3()), port, gun: gunRoot.getWorldPosition(new Vector3()) };
    };
    try {
      const rest = update();
      expect(rest.wrist.distanceTo(rest.port)).toBeGreaterThan(0);
      expect(mechanics.load(shells, 0)).toBeUndefined();
      const { duration } = queue.jobs[0]!;
      expect(update().wrist.distanceTo(rest.wrist)).toBeCloseTo(0);
      queue.tick(duration / 2);
      const feeding = update();
      expect(feeding.gun.distanceTo(rest.gun)).toBeCloseTo(0);
      const shell = scene.getObjectByName('load-shell-probe');
      expect(shell?.visible).toBe(true);
      expect((scene.getObjectByName('load-gun-probe-mesh') as Mesh | undefined)?.receiveShadow).toBe(true);
      expect((scene.getObjectByName('load-shell-probe-mesh') as Mesh | undefined)?.receiveShadow).toBe(true);
      const shellPosition = shell!.getWorldPosition(new Vector3());
      // Reprojection cannot advance the insertion or perturb an attached support arm.
      expect(update().wrist.distanceTo(feeding.wrist)).toBeCloseTo(0);
      queue.cancel();
      expect(update().wrist.distanceTo(rest.wrist)).toBeCloseTo(0);
      expect(scene.getObjectByName('load-shell-probe')).toBeUndefined();
      expect(shells.count).toBe(2);
      expect(mechanics.load(shells, duration)).toBeUndefined();
      const samples = 50;
      let closest = Number.POSITIVE_INFINITY;
      for (let index = 1; index < samples; index++) {
        queue.tick(duration / samples);
        const pose = update();
        const round = scene.getObjectByName('load-shell-probe');
        if (round?.visible) {
          closest = Math.min(closest, round.getWorldPosition(new Vector3()).distanceTo(pose.port));
        }
        if (index === samples / 2) {
          expect(pose.wrist.distanceTo(feeding.wrist)).toBeCloseTo(0);
        }
      }
      expect(closest).toBeLessThan(rest.wrist.distanceTo(rest.port) / 10);
      expect(feeding.wrist.distanceTo(feeding.port)).toBeLessThan(rest.wrist.distanceTo(rest.port));
      expect(shellPosition.distanceTo(feeding.wrist)).toBeLessThan(shellPosition.distanceTo(rest.wrist));
      queue.tick(duration);
      expect(gun.firearm?.tube).toEqual([shells.type]);
      expect(shells.count).toBe(1);
      expect(update().wrist.distanceTo(rest.wrist)).toBeCloseTo(0);
      expect(scene.getObjectByName('load-shell-probe')).toBeUndefined();
    } finally {
      held.dispose();
    }
  }
});
