import { Group, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import type { Registry } from '../src/core/content.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { LIGHT_MOUNT_SLOT } from '../src/core/firearmFitting.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { chargeOf, inventoryLightSources, toggleLight } from '../src/core/lights.ts';
import { bindReach } from '../src/core/reach.ts';
import { FirearmAttachmentHandling } from '../src/game/firearmAttachmentHandling.ts';
import { Survival } from '../src/game/survival.ts';
import { Flashlight } from '../src/render/flashlight.ts';
import { HeldItems } from '../src/render/hands.ts';
import { LENS, type ModelLibrary } from '../src/render/models.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { CALIBRATED_NEAR_FIELD_M } from './flashlightFixture.ts';
import { Simulation } from './simulationFixture.ts';

const SITE_KIND = 'fixture-strap';

// Fixture ids derived from real content so the model, lens and light come from authored data.
const fixtureRegistry = (): Registry => {
  const base = baseRegistry();
  const gun = base.items.get('pump_shotgun')!;
  const mount = base.items.get('taped_flashlight_mount')!;
  const items = new Map(base.items);
  items.set('fixture_gun', {
    ...gun,
    id: 'fixture_gun',
    lightMountSite: { kind: SITE_KIND, at: gun.lightMountSite!.at, turn: gun.lightMountSite!.turn },
  });
  items.set('fixture_bare_gun', { ...gun, id: 'fixture_bare_gun', lightMountSite: undefined });
  items.set('fixture_mount', { ...mount, id: 'fixture_mount', lightMount: { kind: SITE_KIND } });
  items.set('fixture_other_mount', { ...mount, id: 'fixture_other_mount', lightMount: { kind: 'fixture-other' } });
  const bag = base.items.get('school_backpack')!;
  const span = Math.max(...gun.size) * 2;
  items.set('fixture_bag', {
    ...bag,
    id: 'fixture_bag',
    container: {
      ...bag.container!,
      pockets: [{ ...bag.container!.pockets[0]!, grid: [span, span] }],
    },
  });
  return { ...base, items };
};

const setup = () => {
  const registry = fixtureRegistry();
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const handling = new FirearmAttachmentHandling(inventory, queue, () => [0, 0, 0]);
  const sim = new Simulation({ seed: 1 });
  const survival = new Survival(sim, inventory, queue, {
    reach: bindReach({ inventory, position: [0, 0, 0], blockSize: 1, clock: BASE_CLOCK }),
    feet: () => ({ kind: 'pile', pos: [0, 0, 0] }),
    notice: () => undefined,
    read: () => {
      throw new Error('Unexpected reading');
    },
  });
  return { registry, inventory, queue, handling, sim, survival };
};

const fitted = (inventory: Inventory) => {
  const gun = inventory.create('fixture_gun');
  const mount = inventory.create('fixture_mount');
  inventory.add(gun, { kind: 'hand', side: 'right' });
  inventory.add(mount, { kind: 'pile', pos: [0, 0, 0] });
  return { gun, mount };
};

describe('a light mount on a long gun', () => {
  it('requires and consumes a handheld flashlight when crafting the taped light item', () => {
    const base = fixtureRegistry();
    const authored = base.recipes.get('make_taped_flashlight_mount')!;
    const recipe = { ...authored, id: 'fixture_recipe', workstation: undefined, qualities: {} };
    const registry = { ...base, recipes: new Map(base.recipes).set(recipe.id, recipe) };
    const character = new Character(registry);
    const inventory = new Inventory(registry, undefined, undefined, character);
    character.learnRecipes([recipe.id]);
    const queue = new HandlingQueue(inventory);
    const sim = new Simulation({ seed: 1 });
    const position: [number, number, number] = [0, 0, 0];
    const reach = bindReach({ inventory, position, blockSize: 1, clock: BASE_CLOCK });
    sim.actions.craft = craftActionHooks(inventory, character, reach, () => position);
    const commands = new CraftCommands({ inventory, character, sim, queue, reach });
    for (const alternatives of recipe.components) {
      const component = alternatives[0]!;
      if (component.item !== 'flashlight') {
        expect(inventory.add(inventory.create(component.item, component.count), { kind: 'pile', pos: position })).toBe(
          true,
        );
      }
    }
    expect(commands.start(recipe.id)).toBeTypeOf('string');
    const flashlight = inventory.create('flashlight');
    const batteryUid = flashlight.slots!.battery!.uid;
    expect(inventory.add(flashlight, { kind: 'pile', pos: position })).toBe(true);
    expect(commands.start(recipe.id)).toBeUndefined();
    const work = inventory.hands.right!;
    expect(work.work!.components.some((component) => component.uid === flashlight.uid)).toBe(true);
    const inProgress = Inventory.restoreState(registry, structuredClone(inventory.snapshotState()) as never);
    expect(inProgress.itemByUid(flashlight.uid)?.slots?.battery?.uid).toBe(batteryUid);
    sim.scheduler.advance(Math.ceil(work.work!.duration / sim.clock.ratio) + 1);
    expect(inventory.itemByUid(flashlight.uid)).toBeUndefined();
    expect(inventory.itemByUid(batteryUid)).toBeUndefined();
    expect([...inventory.items()].some(({ item }) => item.type === recipe.result.item)).toBe(true);
  });
  it('is fitted and removed through the timed attachment path', () => {
    const { inventory, queue, handling } = setup();
    const { gun, mount } = fitted(inventory);
    expect(handling.fit(gun.uid, LIGHT_MOUNT_SLOT, mount.uid)).toBeUndefined();
    expect(gun.slots?.[LIGHT_MOUNT_SLOT]).toBeUndefined();
    queue.tick(60);
    expect(gun.slots?.[LIGHT_MOUNT_SLOT]).toBe(mount);
    expect(handling.remove(gun.uid, LIGHT_MOUNT_SLOT)).toBeUndefined();
    queue.tick(60);
    expect(gun.slots?.[LIGHT_MOUNT_SLOT]).toBeUndefined();
  });

  it('refuses a mount whose kind the gun does not take', () => {
    const { inventory, handling } = setup();
    const { gun } = fitted(inventory);
    const other = inventory.create('fixture_other_mount');
    inventory.add(other, { kind: 'pile', pos: [0, 0, 0] });
    expect(handling.fit(gun.uid, LIGHT_MOUNT_SLOT, other.uid)).toBeTypeOf('string');
  });

  it('refuses a gun that content gives no place for a light', () => {
    const { inventory, handling } = setup();
    const bare = inventory.create('fixture_bare_gun');
    const mount = inventory.create('fixture_mount');
    inventory.add(bare, { kind: 'hand', side: 'right' });
    inventory.add(mount, { kind: 'pile', pos: [0, 0, 0] });
    expect(handling.fit(bare.uid, LIGHT_MOUNT_SLOT, mount.uid)).toBeTypeOf('string');
  });

  it('shines from the held gun and switches with the light toggle', () => {
    const { registry, inventory, queue, handling } = setup();
    const { gun, mount } = fitted(inventory);
    handling.fit(gun.uid, LIGHT_MOUNT_SLOT, mount.uid);
    queue.tick(60);
    const light = gun.slots![LIGHT_MOUNT_SLOT]!;
    expect(toggleLight(registry, light, 0)).toBeUndefined();
    expect(light.on).toBe(true);
    const held = new HeldItems(inventory, undefined, registry.figures.get('player')!.palette);
    held.update(new PerspectiveCamera());
    expect(held.lensOf(light, new Vector3())).toBe(true);
    held.dispose();
  });

  it('keeps a slung switched-on light draining and shining as the player moves', () => {
    const { registry, inventory, queue, handling, sim } = setup();
    const { gun, mount } = fitted(inventory);
    expect(handling.fit(gun.uid, LIGHT_MOUNT_SLOT, mount.uid)).toBeUndefined();
    queue.tick(60);
    const sling = inventory.create([...registry.items.values()].find((item) => item.sling)!.id);
    expect(inventory.add(sling, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(handling.fit(gun.uid, 'sling', sling.uid)).toBeUndefined();
    queue.tick(60);
    expect(toggleLight(registry, mount)).toBeUndefined();
    expect(inventory.move(gun, { kind: 'worn' }).ok).toBe(true);
    const before = chargeOf(registry, mount)!;
    sim.scheduler.advance(1);
    expect(mount.on).toBe(true);
    expect(chargeOf(registry, mount)).toBeLessThan(before);
    const camera = new PerspectiveCamera();
    const held = new HeldItems(inventory, undefined, registry.figures.get('player')!.palette);
    const beam = new Flashlight(new Scene(), 1, CALIBRATED_NEAR_FIELD_M, false);
    held.update(camera);
    beam.update({ registry, inventory, held, camera, lit: mount });
    expect(beam.light.intensity).toBeGreaterThan(0);
    const start = beam.light.position.clone();
    camera.position.set(4, 2, 3);
    held.update(camera);
    beam.update({ registry, inventory, held, camera, lit: mount });
    expect(beam.light.position.clone().sub(start).toArray()).toEqual(camera.position.toArray());
    expect(inventoryLightSources(inventory, [4, 2, 3], 1).some((source) => source.carried)).toBe(true);
    const bag = inventory.create('fixture_bag');
    expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
    expect(inventory.move(gun, { kind: 'pocket', owner: bag, pocket: 0 }).ok).toBe(true);
    const baggedCharge = chargeOf(registry, mount)!;
    sim.scheduler.advance(1);
    expect(mount.on).toBe(true);
    expect(chargeOf(registry, mount)).toBeLessThan(baggedCharge);
    beam.update({ registry, inventory, held, camera, lit: mount });
    expect(beam.light.intensity).toBe(0);
    expect(inventoryLightSources(inventory, [4, 2, 3], 1)).toEqual([]);
    beam.dispose();
    held.dispose();
  });

  it('shines from a dropped gun ground pose only while switched on', () => {
    const { registry, inventory, queue, handling, sim } = setup();
    const { gun, mount } = fitted(inventory);
    expect(handling.fit(gun.uid, LIGHT_MOUNT_SLOT, mount.uid)).toBeUndefined();
    queue.tick(60);
    expect(toggleLight(registry, mount)).toBeUndefined();
    expect(inventory.move(gun, { kind: 'pile', pos: [0, 0, 0] }).ok).toBe(true);
    const before = chargeOf(registry, mount)!;
    sim.scheduler.advance(1);
    expect(chargeOf(registry, mount)).toBeLessThan(before);
    const sources = inventoryLightSources(inventory, [0, 0, 0], 1);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.carried).toBe(false);
    expect(sources[0]!.seenFrom).toBeGreaterThan(0);
    const ground = new Group();
    const lens = new Object3D();
    lens.name = LENS;
    lens.position.set(0.2, 0.1, 0);
    lens.rotation.x = Math.PI / 2;
    ground.add(lens);
    const models = { version: 1, has: () => true, groundLook: () => ground } as unknown as ModelLibrary;
    const piles = new PileMeshes(1, models);
    piles.sync(inventory);
    const held = new HeldItems(inventory, undefined, registry.figures.get('player')!.palette);
    const camera = new PerspectiveCamera();
    const beam = new Flashlight(new Scene(), 1, CALIBRATED_NEAR_FIELD_M, false);
    const update = () => beam.update({ registry, inventory, held, camera, lit: undefined, piles });
    update();
    expect(beam.light.intensity).toBeGreaterThan(0);
    expect(beam.light.position.distanceTo(lens.getWorldPosition(new Vector3()))).toBeLessThan(1e-8);
    const direction = new Vector3(0, 0, -1).transformDirection(lens.matrixWorld);
    expect(beam.light.target.position.clone().sub(beam.light.position).normalize().distanceTo(direction)).toBeLessThan(
      1e-8,
    );
    const start = beam.light.position.clone();
    camera.position.set(4, 2, 3);
    update();
    expect(beam.light.position.distanceTo(start)).toBeLessThan(1e-8);
    expect(toggleLight(registry, mount)).toBeUndefined();
    update();
    expect(beam.light.intensity).toBe(0);
    expect(inventoryLightSources(inventory, [0, 0, 0], 1)).toEqual([]);
    beam.dispose();
    held.dispose();
    piles.dispose();
  });

  it('swaps a fitted battery through timed use and saves it without detaching the mount', () => {
    const { registry, inventory, queue, handling, survival, sim } = setup();
    const { gun, mount } = fitted(inventory);
    expect(handling.fit(gun.uid, LIGHT_MOUNT_SLOT, mount.uid)).toBeUndefined();
    queue.tick(60);
    expect(toggleLight(registry, mount)).toBeUndefined();
    sim.scheduler.advance(1);
    const old = mount.slots!.battery!;
    const before = chargeOf(registry, old)!;
    const replacement = inventory.create(old.type);
    expect(inventory.add(replacement, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(survival.use(replacement)).toBeUndefined();
    expect(mount.slots!.battery).toBe(old);
    queue.tick(60);
    expect(gun.slots![LIGHT_MOUNT_SLOT]).toBe(mount);
    expect(mount.slots!.battery).toBe(replacement);
    expect(chargeOf(registry, old)).toBe(before);
    expect(inventory.locate(old)?.kind).toBe('pile');
    const restored = Inventory.restoreState(registry, structuredClone(inventory.snapshotState()) as never);
    const saved = restored.itemByUid(gun.uid)!.slots![LIGHT_MOUNT_SLOT]!;
    expect(saved.uid).toBe(mount.uid);
    expect(saved.on).toBe(true);
    expect(saved.slots!.battery!.uid).toBe(replacement.uid);
    expect(chargeOf(registry, saved)).toBe(chargeOf(registry, replacement));
  });
});
