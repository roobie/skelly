import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { doorOptions } from '../src/core/options.ts';
import { DOOR_ACTION, registerDoorAction } from '../src/game/doorAction.ts';

const base = readdirSync('src/content/base')
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({
    source: f,
    data: JSON.parse(readFileSync(join('src/content/base', f), 'utf8')) as unknown,
  }));
const furniture = {
  id: 'lock_test_door',
  name: 'Test door',
  size: [1, 1, 1],
  color: '#666666',
  door: { handling: 0.3 },
};
const template = (id: string, lock: string, door = 'lock_test_door') => ({
  id,
  size: [1, 1, 1],
  palette: { D: { furniture: door, lock: { id: lock, locked: true } } },
  layers: [['D']],
});
const key = (id: string, lock: string) => ({
  id,
  name: 'Test key',
  category: 'tool',
  weight: 10,
  size: [1, 1],
  key: { lock },
});
const fixture = () => ({
  furniture: [furniture],
  templates: [template('lock_test_a', 'test_a'), template('lock_test_b', 'test_b')],
  items: [key('lock_test_key_a', 'test_a'), key('lock_test_key_b', 'test_b')],
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
  it('the door owner refuses opening a locked door even without the interaction adapter', () => {
    const { inventory, door } = make();
    expect(inventory.entities.setOpen(door, true)).toBe("It's locked");
    expect(door.open).toBe(false);
    expect(doorOptions(inventory, door)[0]!.plan).toEqual({ ok: false, reason: "It's locked" });
  });
  it('lock options distinguish no held key from a wrong key and use the door handling time', () => {
    const { inventory, door } = make();
    expect(doorOptions(inventory, door)[1]!.plan).toEqual({ ok: false, reason: 'Hold the key in your hands' });
    const wrong = inventory.create('lock_test_key_b');
    inventory.add(wrong, { kind: 'hand', side: 'right' });
    expect(doorOptions(inventory, door)[1]!.plan).toEqual({ ok: false, reason: "The key doesn't fit" });
    inventory.consume(wrong);
    inventory.add(inventory.create('lock_test_key_a'), { kind: 'hand', side: 'left' });
    expect(doorOptions(inventory, door)[1]).toMatchObject({ label: 'Unlock', plan: { ok: true, time: 0.3 } });
    inventory.canReachEntity = () => false;
    expect(doorOptions(inventory, door)[1]!.plan).toEqual({ ok: false, reason: 'Too far away' });
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
    });
    queue.enqueueAction(DOOR_ACTION, 'Unlock', 0.3, { entityUid: door.uid, locked: false });
    queue.tick(0.1);
    expect(door.lock!.locked).toBe(true);
    inventory.move(held, { kind: 'pile', pos: [0, 0, 0] });
    expect(queue.tick(0.2).failed[0]?.reason).toBe('Hold the key in your hands');
    expect(door.lock!.locked).toBe(true);
    inventory.move(held, { kind: 'hand', side: 'right' });
    queue.enqueueAction(DOOR_ACTION, 'Unlock', 0.3, { entityUid: door.uid, locked: false });
    queue.tick(0.3);
    expect(door.lock!.locked).toBe(false);
    expect(sounds).toEqual([]);
    inventory.entities.setOpen(door, true);
    expect(inventory.entities.setLocked(door, true, ['test_a'])).toBe('Close the door first');
  });
  it('rejects an empty authored door lock id', () => {
    const data = fixture();
    data.templates[0]!.palette.D.lock.id = '';
    expect(
      buildRegistry([{ source: 'locks.json', data }]).issues.some((issue) => issue.path.endsWith('.lock.id')),
    ).toBe(true);
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
  it('rejects repeating the same lock id in an authored site without placement scoping', () => {
    const data = {
      ...fixture(),
      layouts: [
        {
          id: 'lock_test_site',
          bounds: { x0: 0, z0: 0, x1: 4, z1: 4 },
          ground: 0,
          buildings: [0, 2].map((x) => ({ template: 'lock_test_a', position: [x, 0, 0], rotation: 0 })),
          player: { position: [1, 0, 1], yaw: 0 },
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
