import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { type CoreMessageKey, coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { placedPieces } from '@skelly/engine/internal/core/templates.ts';
import { doorOptions, doorPlan, HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { coreLabel } from '@skelly/engine/text';
import { makeScale, toChunk, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { DOOR_ACTION, registerDoorAction } from '../../engine/src/game/doorAction.ts';
import { baseContentSources } from './baseContentFiles.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';

const base = baseContentSources();
const furniture = {
  id: 'lock_test_door',
  name: 'Test door',
  size: [1, 1, 1],
  color: '#666666',
  door: { methods: {}, handlingSimSeconds: 0.3 },
};
const template = (id: string, lock: string, door = 'lock_test_door') => ({
  id,
  size: [1, 1, 1],
  palette: { D: { furniture: door, lock: { id: lock, locked: true } } },
  layers: [['D']],
});
const key = (id: string, lock: string, name: string) => ({
  id,
  name,
  category: 'tool',
  weight: 10,
  size: [1, 1] as [number, number],
  key: { lock },
});
/** One column, two blocks tall, with a locked door on storey `storey` and air on the other. */
const storeyTemplate = (id: string, lock: string, storey: 0 | 1) => ({
  id,
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  size: [1, 2, 1],
  palette: { D: { furniture: 'lock_test_door', lock: { id: lock, locked: true } }, '.': 'air' },
  layers: storey === 0 ? [['D'], ['.']] : [['.'], ['D']],
});
const fixture = () => ({
  furniture: [furniture],
  templates: [
    template('lock_test_a', 'test_a'),
    template('lock_test_b', 'test_b'),
    storeyTemplate('lock_storey_ground', 'test_a', 0),
    storeyTemplate('lock_storey_upper', 'test_b', 1),
  ],
  items: [key('lock_test_key_a', 'test_a', 'A test key'), key('lock_test_key_b', 'test_b', 'B test key')],
});
const { registry, issues } = buildRegistry([...base, { source: 'lock-test.json', data: fixture() }]);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const make = () => {
  const inventory = new Inventory(registry);
  const door = inventory.furnish({
    type: furniture.id,
    pos: [4, 0, 0],
    size: [1, 1, 1],
    facing: 'n',
    lock: { id: 'test_a', locked: true },
  })!;
  return { inventory, door };
};

describe('door locks', () => {
  it('carries independent locks through placements on two storeys into native queued door operations', () => {
    const scale = makeScale(0.5);
    const lootContext = { usage: ['Residential' as const], tier: 'Tier1' as const };
    const placed = ['lock_storey_ground', 'lock_storey_upper'].map((id, index) => ({
      template: id,
      lootContext,
      position: [4 + 4 * index, 0, 4].map((value) => value * scale.blockSize) as Vec3,
      rotation: 0 as const,
    }));
    const site = new AuthoredSite(73, registry, scale, {
      id: 'locks_storeys',
      lootContext,
      bounds: { x0: 0, z0: 0, x1: 16, z1: 16 },
      ground: 0,
      terrain: [],
      woodlands: [],
      tracks: [],
      shamblers: [],
      player: { position: [1, 1, 1], bearing: 0 },
      buildings: placed,
    });
    const doors = site.placements.flatMap(placedPieces).filter((piece) => piece.lock);
    expect(new Set(doors.map((piece) => piece.lock!.id))).toEqual(new Set(['test_a', 'test_b']));
    expect(new Set(doors.map((piece) => piece.pos[1])).size).toBe(2);
    const keyFor = (lock: string) => [...registry.items.values()].find((item) => item.key?.lock === lock)!.id;
    const inventory = new Inventory(registry);
    const queue = new HandlingQueue(inventory);
    registerDoorAction({
      queue,
      inventory,
      player: () => ({ pos: [0, 0, 0], vel: [0, 0, 0], halfWidth: 0.2, height: 1.8, onGround: true }),
      others: () => [],
      playWorldSound: () => undefined,
      closeBlockedMessages: { player: 'fixture player blocks', other: 'fixture other blocks' },
    });
    for (const piece of doors) {
      const spawn = site
        .furnitureIn(toChunk(piece.pos[0]), toChunk(piece.pos[2]))
        .find(({ spec }) => spec.lock?.id === piece.lock!.id)!;
      const door = inventory.furnish(spawn.spec, spawn.loot)!;
      expect(inventory.entities.setOpen(door, true)).toBe(coreMessage(inventory.registry, 'locked'));
      const held = inventory.create(keyFor(piece.lock!.id));
      inventory.add(held, { kind: 'hand', side: 'right' });
      const unlock = doorOptions(inventory, door)[1]!;
      expect(unlock.plan.ok).toBe(true);
      if (!unlock.plan.ok) {
        throw new Error(unlock.plan.reason);
      }
      queue.enqueueAction(DOOR_ACTION, 'Unlock', unlock.plan.time, { entityUid: door.uid, locked: false });
      expect(queue.tick(unlock.plan.time).failed).toEqual([]);
      expect(door.lock).toEqual({ id: piece.lock!.id, locked: false });
      expect(piece.lock!.locked).toBe(true);
      expect(inventory.entities.setOpen(door, true)).toBeUndefined();
      inventory.consume(held);
    }
  });
  it('the door owner refuses opening a locked door even without the interaction adapter', () => {
    const { inventory, door } = make();
    const locked = coreMessage(inventory.registry, 'locked');
    expect(inventory.entities.setOpen(door, true)).toBe(locked);
    expect(door.open).toBe(false);
    expect(doorOptions(inventory, door)[0]!.plan).toEqual({ ok: false, reason: locked });
  });
  it('lock options distinguish no held key from a wrong key and use the door handling time', () => {
    const { inventory, door } = make();
    const say = (message: CoreMessageKey) => coreMessage(inventory.registry, message);
    expect(doorOptions(inventory, door)[1]!.plan).toEqual({ ok: false, reason: say('noKey') });
    const wrong = inventory.create('lock_test_key_b');
    inventory.add(wrong, { kind: 'hand', side: 'right' });
    expect(doorOptions(inventory, door)[1]!.plan).toEqual({ ok: false, reason: say('wrongKey') });
    inventory.consume(wrong);
    inventory.add(inventory.create('lock_test_key_a'), { kind: 'hand', side: 'left' });
    expect(doorOptions(inventory, door)[1]).toMatchObject({
      label: coreLabel(inventory.registry, 'unlock'),
      plan: { ok: true, time: 0.3 },
    });
    inventory.canReachEntity = () => false;
    expect(doorOptions(inventory, door)[1]!.plan).toEqual({ ok: false, reason: say('tooFar') });
  });
  it('open-close plans do not recheck F target reach', () => {
    const { inventory, door } = make();
    expect(inventory.entities.setLocked(door, false, ['test_a'])).toBeUndefined();
    expect(inventory.entities.setOpen(door, true)).toBeUndefined();
    inventory.canReachEntity = () => false;
    expect(doorOptions(inventory, door)[0]!.plan).toEqual({ ok: true, time: 0.3 });
    expect(doorOptions(inventory, door)[1]!.plan).toEqual({
      ok: false,
      reason: coreMessage(inventory.registry, 'doorOpen'),
    });
  });
  it('queued unlocking rechecks reach at completion', () => {
    const { inventory, door } = make();
    const held = inventory.create('lock_test_key_a');
    inventory.add(held, { kind: 'hand', side: 'right' });
    const queue = new HandlingQueue(inventory);
    registerDoorAction({
      queue,
      inventory,
      player: () => ({ pos: [0, 0, 0], vel: [0, 0, 0], halfWidth: 0.2, height: 1.8, onGround: true }),
      others: () => [],
      playWorldSound: () => undefined,
      closeBlockedMessages: { player: 'fixture player blocks', other: 'fixture other blocks' },
    });
    queue.enqueueAction(DOOR_ACTION, 'Unlock', 0.3, { entityUid: door.uid, locked: false });
    queue.tick(0.1);
    inventory.canReachEntity = () => false;
    expect(queue.tick(0.2).failed[0]?.reason).toBe(coreMessage(inventory.registry, 'tooFar'));
    expect(door.lock!.locked).toBe(true);
  });
  it('queued unlocking rechecks the held key and does not emit a sound on success or refusal', () => {
    const { inventory, door } = make();
    const held = inventory.create('lock_test_key_a');
    inventory.add(held, { kind: 'hand', side: 'right' });
    const queue = new HandlingQueue(inventory);
    const sounds: string[] = [];
    registerDoorAction({
      queue,
      inventory,
      player: () => ({ pos: [0, 0, 0], vel: [0, 0, 0], halfWidth: 0.2, height: 1.8, onGround: true }),
      others: () => [],
      playWorldSound: (event) => sounds.push(event),
      closeBlockedMessages: { player: 'fixture player blocks', other: 'fixture other blocks' },
    });
    queue.enqueueAction(DOOR_ACTION, 'Unlock', 0.3, { entityUid: door.uid, locked: false });
    queue.tick(0.1);
    expect(door.lock!.locked).toBe(true);
    inventory.move(held, { kind: 'pile', pos: [0, 0, 0] });
    expect(queue.tick(0.2).failed[0]?.reason).toBe(coreMessage(inventory.registry, 'noKey'));
    expect(door.lock!.locked).toBe(true);
    inventory.move(held, { kind: 'hand', side: 'right' });
    queue.enqueueAction(DOOR_ACTION, 'Unlock', 0.3, { entityUid: door.uid, locked: false });
    queue.tick(0.3);
    expect(door.lock!.locked).toBe(false);
    expect(sounds).toEqual([]);
    inventory.entities.setOpen(door, true);
    expect(inventory.entities.setLocked(door, true, ['test_a'])).toBe(coreMessage(inventory.registry, 'doorOpen'));
  });
  it('rejects an empty authored door lock id', () => {
    const data = fixture();
    data.templates[0]!.palette.D.lock.id = '';
    expect(
      buildRegistry([{ source: 'locks.json', data }]).issues.some((issue) => issue.path.endsWith('.lock.id')),
    ).toBe(true);
  });
  it('rejects a locked door whose id no key names', () => {
    const data = fixture();
    data.items = [];
    expect(buildRegistry([{ source: 'locks.json', data }]).issues).toContainEqual({
      source: 'locks.json',
      path: 'templates[0].palette',
      message: 'no key names lock "test_a"',
    });
  });
  it('rejects a key naming a lock that no actual door has', () => {
    const data = fixture();
    data.items[0]!.key.lock = 'absent';
    expect(buildRegistry([{ source: 'locks.json', data }]).issues).toContainEqual({
      source: 'locks.json',
      path: 'items[0].key.lock',
      message: 'no door has lock "absent"',
    });
  });
  it('rejects a lock authored on furniture that is not a door', () => {
    const data = { ...fixture(), furniture: [{ ...furniture, door: undefined }] };
    expect(buildRegistry([{ source: 'locks.json', data }]).issues).toContainEqual({
      source: 'locks.json',
      path: 'templates[0].palette["D"].lock',
      message: 'only a door can have a lock',
    });
  });
  it('rejects reusing a lock id across storeys of one authored placement', () => {
    const data = {
      ...fixture(),
      layouts: [
        {
          id: 'lock_test_site',
          bounds: { x0: 0, z0: 0, x1: 4, z1: 4 },
          ground: 0,
          terrain: [],
          buildings: [{ template: 'lock_test_a', position: [0, 0, 0], rotation: 0, storeys: 2 }],
          player: { position: [1, 0.5, 1], bearing: 0 },
          shamblers: [],
          woodlands: [],
          tracks: [],
        },
      ],
    };
    expect(buildRegistry([{ source: 'locks.json', data }]).issues).toContainEqual({
      source: 'locks.json',
      path: 'layouts[0].buildings[0]',
      message: 'lock "test_a" is used more than once in this site',
    });
  });
  it('rejects a palette character that places the same lock on multiple doors', () => {
    const data = fixture();
    data.templates[0]!.size = [2, 1, 1];
    data.templates[0]!.layers = [['DD']];
    const layout = {
      id: 'lock_test_site',
      bounds: { x0: 0, z0: 0, x1: 4, z1: 4 },
      ground: 0,
      terrain: [],
      buildings: [{ template: 'lock_test_a', position: [0, 0, 0], rotation: 0 }],
      player: { position: [1, 0.5, 1], bearing: 0 },
      shamblers: [],
      woodlands: [],
      tracks: [],
    };
    expect(buildRegistry([{ source: 'locks.json', data: { ...data, layouts: [layout] } }]).issues).toContainEqual({
      source: 'locks.json',
      path: 'layouts[0].buildings[0]',
      message: 'lock "test_a" is used more than once in this site',
    });
  });
  it('rejects repeating the same lock id across placements in an authored site', () => {
    const data = {
      ...fixture(),
      layouts: [
        {
          id: 'lock_test_site',
          bounds: { x0: 0, z0: 0, x1: 4, z1: 4 },
          ground: 0,
          terrain: [],
          buildings: [0, 2].map((x) => ({ template: 'lock_test_a', position: [x, 0, 0], rotation: 0 })),
          player: { position: [1, 0.5, 1], bearing: 0 },
          shamblers: [],
          woodlands: [],
          tracks: [],
        },
      ],
    };
    expect(buildRegistry([{ source: 'locks.json', data }]).issues).toContainEqual({
      source: 'locks.json',
      path: 'layouts[0].buildings[1]',
      message: 'lock "test_a" is used more than once in this site',
    });
  });
});

describe('boarded doors', () => {
  // Every house door faces the street (cityPlan fillRow), and the planks stand on the front.
  it('bars the boarded door from its front, the side every placed house door faces the street', () => {
    expect(registry.furniture.get('gauntlet_door_boarded')!.door!.barredFrom).toBe('front');
  });

  it.each([
    { facing: 'n', size: [2, 4, 1], outward: -1 },
    { facing: 's', size: [2, 4, 1], outward: 1 },
    { facing: 'e', size: [1, 4, 2], outward: 1 },
    { facing: 'w', size: [1, 4, 2], outward: -1 },
  ] as const)('refuse opening from the barricaded side and open from the other facing $facing', (spec) => {
    const inventory = new Inventory(registry);
    const door = inventory.furnish({
      type: 'gauntlet_door_boarded',
      pos: [4, 0, 4],
      size: [...spec.size],
      facing: spec.facing,
    })!;
    const barred = registry.furniture.get('gauntlet_door_boarded')!.door!.barredFrom!;
    const alongX = spec.facing === 'e' || spec.facing === 'w';
    const at = (sign: number): Vec3 => (alongX ? [5 + sign * 3, 0, 5] : [5, 0, 5 + sign * 3]);
    const front = at(spec.outward);
    const back = at(-spec.outward);
    const [street, inside] = barred === 'back' ? [back, front] : [front, back];

    inventory.actorPosition = () => street;
    expect(doorPlan(inventory, door, 'open')).toMatchObject({
      ok: false,
      reason: coreMessage(inventory.registry, 'boardedUp'),
    });
    inventory.actorPosition = () => inside;
    expect(doorPlan(inventory, door, 'open').ok).toBe(true);
  });
});
