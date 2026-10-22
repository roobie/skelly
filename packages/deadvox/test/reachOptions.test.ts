import { describe, expect, it } from 'vitest';
import { Character, dominantSide, offSide } from '../src/core/character.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { SLING_SLOT } from '../src/core/firearmFitting.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, WORK_IN_PROGRESS } from '../src/core/inventory.ts';
import { options, pocketGroundItem, quickbarTake, quickMove, toHands } from '../src/core/options.ts';
import { bindReach, type ReachPlayer, type ReachSnapshot } from '../src/core/reach.ts';
import type { FurnitureDef } from '../src/core/schema.ts';
import type { Zombie } from '../src/core/zombies.ts';
import { downedBodyPlan } from '../src/game/downedBody.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';

const registry = baseRegistry();

const setup = (handedness?: 'right' | 'left', contentRegistry = registry) => {
  const character = new Character(contentRegistry, handedness ? { handedness } : {});
  const inventory = new Inventory(contentRegistry, undefined, undefined, character);
  const player: ReachPlayer = { inventory, position: [0.5, 0, 0.5], blockSize: 1, clock: BASE_CLOCK };
  const view = bindReach(player);
  const queue = new HandlingQueue(inventory);
  const add = (type: string, target: Parameters<Inventory['add']>[1], count = 1) => {
    const item = inventory.create(type, count);
    if (!inventory.add(item, target)) {
      throw new Error(`Fixture item ${type} did not fit`);
    }
    return item;
  };
  return { inventory, player, view, queue, add };
};

const setupStackReuse = () => {
  const { registry: fixtureRegistry, issues } = buildRegistry([
    playerInventorySource(),
    {
      source: 'quick-move-fixture.json',
      data: {
        items: [
          { id: 'fixture_units', name: 'Units', category: 'material', weight: 1, size: [1, 1], stack: 5 },
          {
            id: 'fixture_back',
            name: 'Fixture backpack',
            category: 'bag',
            weight: 1,
            size: [1, 1],
            wearable: { slot: 'back', encumbrance: 0 },
            container: {
              pockets: [
                { grid: [3, 1], handlingSimSeconds: 1 },
                { grid: [3, 1], handlingSimSeconds: 1 },
              ],
            },
          },
        ],
      },
    },
  ]);
  if (issues.length > 0) {
    throw new Error(`Invalid quick-move fixture: ${issues.map((issue) => issue.message).join('; ')}`);
  }
  const inventory = new Inventory(fixtureRegistry);
  const view = bindReach({ inventory, position: [0.5, 0, 0.5], blockSize: 1, clock: BASE_CLOCK });
  const queue = new HandlingQueue(inventory);
  const add = (type: string, target: Parameters<Inventory['add']>[1], count = 1) => {
    const item = inventory.create(type, count);
    if (!inventory.add(item, target)) {
      throw new Error(`Fixture item ${type} did not fit`);
    }
    return item;
  };
  const bag = add('fixture_back', { kind: 'worn' });
  return { inventory, view, queue, add, bag };
};

// Two boundary classes, each checking both sides. The plain case also catches
// treating block distances as metres; the nested case catches omitted ground pockets.
it.each(['plain', 'nested'] as const)('%s ground items cross the absolute 2m boundary', (kind) => {
  const t = setup();
  const item =
    kind === 'plain'
      ? t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] })
      : t.add('canned_beans', {
          kind: 'pocket',
          owner: t.add('school_backpack', { kind: 'pile', pos: [0, 0, 0] }),
          pocket: 0,
        });
  const blockSize = kind === 'plain' ? 0.4 : 1;
  const player = {
    inventory: t.inventory,
    position: [0.5 - 1.999 / blockSize, 0, 0.5] as [number, number, number],
    blockSize,
    clock: BASE_CLOCK,
  };
  const view = bindReach(player);
  expect(view().entries.some((entry) => entry.item === item)).toBe(true);
  player.position[0] = 0.5 - 2.001 / blockSize;
  expect(view().entries.some((entry) => entry.item === item)).toBe(false);
});

it('nearest furniture cell is reachable without revealing unsearched nested contents', () => {
  const { registry: fixtureRegistry, issues } = buildRegistry([
    playerInventorySource(),
    {
      source: 'nested-furniture.json',
      data: {
        items: [
          {
            id: 'fixture_case',
            name: 'Case',
            category: 'bag',
            weight: 1,
            size: [2, 2],
            container: { rigid: true, pockets: [{ grid: [2, 2], handlingSimSeconds: 1 }] },
          },
          { id: 'fixture_plain', name: 'Plain', category: 'material', weight: 1, size: [1, 1] },
        ],
        furniture: [
          {
            id: 'fixture_cabinet',
            name: 'Cabinet',
            size: [4, 2, 1],
            color: '#ffffff',
            container: { pockets: [{ grid: [4, 4], handlingSimSeconds: 1 }] },
          },
        ],
      },
    },
  ]);
  expect(issues).toEqual([]);
  const t = setup(undefined, fixtureRegistry);
  const entity = t.inventory.entities.add({ type: 'fixture_cabinet', pos: [2, 0, 0], size: [4, 2, 1], facing: 'n' })!;
  const bag = t.add('fixture_case', { kind: 'furniture', entity, pocket: 0 });
  const beans = t.add('fixture_plain', { kind: 'pocket', owner: bag, pocket: 0 });
  expect(t.view().furniture).toContain(entity);
  expect(t.view().entries).toHaveLength(0);
  t.inventory.entities.markSearched(entity);
  const entry = t.view().entries.find((row) => row.item === beans)!;
  expect(entry.location).toMatchObject({ kind: 'pocket', owner: bag });
  expect(entry.handlingTime).toBeGreaterThan(0);
  expect(t.view().workstations).toEqual([]);
});

const furnitureOf = (kind: (definition: FurnitureDef) => unknown) => [...registry.furniture.values()].find(kind)!;

/** Puts one reach target in cell `pos`; its check lists every way the player reaches it now. */
const reachTargets = {
  container: (inventory, pos) => {
    const type = furnitureOf((definition) => definition.container).id;
    const entity = inventory.entities.add({ type, pos, size: [1, 1, 1], facing: 'n' })!;
    return (_player, view) => [inventory.canReachEntity(entity), view().furniture.includes(entity)];
  },
  // A hatch has no pockets, so it is never listed as loot; admission is its whole reach.
  hatch: (inventory, pos) => {
    const type = furnitureOf((definition) => definition.door?.hatch).id;
    const entity = inventory.entities.add({ type, pos, size: [1, 1, 1], facing: 'n' })!;
    return () => [inventory.canReachEntity(entity)];
  },
  pile: (inventory, pos) => {
    const item = inventory.create('canned_beans');
    if (!inventory.add(item, { kind: 'pile', pos })) {
      throw new Error('Fixture pile did not fit');
    }
    return (_player, view) => [inventory.canReach(pos), view().entries.some((entry) => entry.item === item)];
  },
  body: (_inventory, pos) => {
    const zombie = {
      incapacitated: true,
      type: [...registry.zombies.values()].find((definition) => definition.downed)!,
      body: { pos: [pos[0] + 0.5, pos[1], pos[2] + 0.5], halfWidth: 0.4, height: 0.5 },
    } as Zombie;
    return (player) => [downedBodyPlan(player, zombie, 'finish-off').ok];
  },
} satisfies Record<
  string,
  (inventory: Inventory, pos: Vec3) => (player: ReachPlayer, view: () => ReachSnapshot) => boolean[]
>;

it.each(['container', 'pile', 'body'] as const)(
  'a solid wall between chest and %s puts it out of reach until the wall is gone',
  (target) => {
    const inventory = new Inventory(registry);
    let wall = true;
    const obstacles = {
      isSolid: (x: number) => wall && x === 1,
      version: 0,
    };
    const reached = reachTargets[target](inventory, [2, 0, 0]);
    const player: ReachPlayer = { inventory, position: [0.5, 0, 0.5], blockSize: 0.5, clock: BASE_CLOCK, obstacles };
    const view = bindReach(player);
    expect(reached(player, view)).not.toContain(true);
    wall = false;
    obstacles.version += 1;
    expect(reached(player, view)).not.toContain(false);
  },
);

it.each([
  {
    surround: 'a container flush in a wall row, from beside the wall',
    target: 'container',
    pos: [2, 0, 0],
    isSolid: (x: number, _y: number, z: number) => z === 0 && (x === 1 || x === 3),
    position: [4.5, 0, -0.5],
  },
  {
    surround: 'a hatch flush in the floor, from beside it',
    target: 'hatch',
    pos: [0, -1, 0],
    isSolid: (_x: number, y: number) => y === -1,
    position: [3.5, 0, 0.5],
  },
  {
    surround: 'a pile in a doorway, from beside the wall',
    target: 'pile',
    pos: [2, 0, 0],
    isSolid: (x: number, y: number, z: number) => y === -1 || (z === 0 && (x === 1 || x === 3)),
    position: [4.5, 0, -0.5],
  },
  {
    surround: 'a body on the floor, from beside it',
    target: 'body',
    pos: [0, 0, 0],
    isSolid: (_x: number, y: number) => y === -1,
    position: [3.5, 0, 0.5],
  },
] satisfies { surround: string; target: keyof typeof reachTargets; pos: Vec3; isSolid: unknown; position: Vec3 }[])(
  'reaches $surround through the face the chest sees',
  ({ target, pos, isSolid, position }) => {
    const inventory = new Inventory(registry);
    const reached = reachTargets[target](inventory, [...pos]);
    const obstacles = { isSolid, version: 0 };
    const player: ReachPlayer = { inventory, position: [...position], blockSize: 0.5, clock: BASE_CLOCK, obstacles };
    expect(reached(player, bindReach(player))).not.toContain(false);
  },
);

it('lists workstation components only when their furniture box is within two metres', () => {
  const fixtureFurniture = new Map(registry.furniture);
  fixtureFurniture.set('fixture_reach_station', {
    id: 'fixture_reach_station',
    name: 'Fixture station',
    size: [1, 3, 1],
    color: '#ffffff',
    workstation: { id: 'fixture_station', qualities: { sawing: 1 }, workFactorBonus: 0.2 },
  });
  const fixtureRegistry = { ...registry, furniture: fixtureFurniture };
  const inventory = new Inventory(fixtureRegistry);
  const player: ReachPlayer = { inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK };
  const view = bindReach(player);
  const near = inventory.entities.add({
    type: 'fixture_reach_station',
    pos: [3, 0, 0],
    size: [1, 3, 1],
    facing: 'n',
  })!;
  inventory.entities.add({
    type: 'fixture_reach_station',
    pos: [5, 0, 0],
    size: [1, 3, 1],
    facing: 'n',
  });
  expect(view().workstations).toEqual([
    {
      entity: near,
      id: 'fixture_station',
      qualities: { sawing: 1 },
      workFactorBonus: 0.2,
    },
  ]);
});

it('a queued move rechecks proximity after its displayed option was admitted', () => {
  const t = setup();
  const item = t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] });
  expect(t.queue.enqueue(item, { kind: 'hand', side: 'right' }).ok).toBe(true);
  t.player.position[0] = 10;
  t.queue.tick(10);
  expect(t.inventory.locate(item)?.kind).toBe('pile');
  expect(t.inventory.hands.right).toBeUndefined();
});

it('opened beans expose the eat time and a refusal when both hands hold other items', () => {
  const t = setup();
  const beans = t.add('beans', { kind: 'hand', side: 'right' });
  expect(options(beans, t.view()).find((option) => option.kind === 'use')).toMatchObject({
    plan: { ok: true, time: registry.items.get('beans')!.food!.consumeSimSeconds },
  });
  const backpack = t.add('school_backpack', { kind: 'worn' });
  t.inventory.move(beans, { kind: 'pocket', owner: backpack, pocket: 0 });
  t.add('flashlight', { kind: 'hand', side: 'right' });
  t.add('chocolate_bar', { kind: 'hand', side: 'left' });
  expect(options(beans, t.view()).find((option) => option.kind === 'use')).toMatchObject({ plan: { ok: false } });
});

describe('handling move admission', () => {
  it.each(['toHands', 'quickbarTake'] as const)(
    'stows a sling-fitted long gun on the shoulder when %s wields a one-hand tool',
    (route) => {
      const t = setup();
      const leading = dominantSide(t.inventory.character);
      const gun = t.add('pump_shotgun', { kind: 'hand', side: leading });
      t.inventory.fitSlot(gun, SLING_SLOT, t.inventory.create('weapon_sling'));
      const crowbar = t.add('crowbar', { kind: 'pile', pos: [0, 0, 0] });

      const refusal =
        route === 'toHands'
          ? toHands(t.inventory, t.queue, crowbar, [0, 0, 0])
          : quickbarTake(t.inventory, t.queue, crowbar);
      expect(refusal).toBeUndefined();
      t.queue.tick(10);

      expect(t.inventory.worn.shoulder).toBe(gun);
      expect(t.inventory.hands[leading]).toBe(crowbar);
      expect(t.inventory.piles.size).toBe(0);
    },
  );

  it('refuses an identical quick move and spends only the first job time', () => {
    const t = setup();
    t.add('school_backpack', { kind: 'worn' });
    const item = t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] });
    const first = t.queue.enqueue(item, quickMove(item, t.view()).target);
    if (!first.ok) {
      throw new Error(first.reason);
    }
    expect
      .soft(t.queue.enqueue(item, quickMove(item, t.view()).target))
      .toEqual({ ok: false, reason: expect.any(String) });
    expect.soft(t.queue.jobs).toHaveLength(1);
    expect(t.queue.tick(first.job.duration).done).toEqual([first.job]);
    expect(t.queue.remaining).toBe(0);
    expect(t.queue.busy).toBe(false);
    // Same uid/target with a different requested count is not an exact duplicate.
    const stack = t.add('rag', { kind: 'pile', pos: [0, 0, 0] }, 2);
    const { target } = quickMove(stack, t.view());
    expect(t.queue.enqueue(stack, target, 1).ok).toBe(true);
    expect(t.queue.enqueue(stack, target, 2).ok).toBe(true);
    t.queue.cancel();
  });

  it.each(['moved', 'consumed'] as const)('drops a %s item move at its turn without spending time', (change) => {
    const t = setup();
    const bag = t.add('school_backpack', { kind: 'worn' });
    const item = t.add('rag', { kind: 'pile', pos: [0, 0, 0] });
    const target = { kind: 'pocket', owner: bag, pocket: 0 } as const;
    t.queue.registerAction('fixture.change', () => {
      if (change === 'consumed') {
        t.inventory.consume(item);
        return;
      }
      const result = t.inventory.move(item, target);
      return result.ok ? undefined : result.reason;
    });
    t.queue.enqueueAction('fixture.change', 'Change item', 1);
    const move = t.queue.enqueue(item, target);
    if (!move.ok) {
      throw new Error(move.reason);
    }
    const result = t.queue.tick(1);
    expect(result.done).toHaveLength(1);
    expect(result.failed).toEqual([{ job: move.job, reason: expect.any(String) }]);
    expect(result.failed[0]?.reason).toBeTruthy();
    expect(move.job.elapsed).toBe(0);
    expect(t.queue.remaining).toBe(0);
    expect(t.queue.jobs).toEqual([]);
  });

  it('keeps same-item different-target chains and re-plans their time at the head', () => {
    const t = setup();
    const item = t.add('rag', { kind: 'pile', pos: [0, 0, 0] });
    const first = t.queue.enqueue(item, { kind: 'hand', side: 'left' });
    const second = t.queue.enqueue(item, { kind: 'hand', side: 'right' });
    if (!(first.ok && second.ok)) {
      throw new Error('Fixture chain did not queue');
    }
    // A 1x1 rag takes 1.05s from the floor, then zero handling time hand-to-hand.
    const result = t.queue.tick(1.05);
    expect(result.done).toEqual([first.job, second.job]);
    expect(result.failed).toEqual([]);
    expect(second.job.duration).toBe(0);
    expect(t.inventory.hands.right).toBe(item);
    expect(t.inventory.hands.left).toBeUndefined();
    expect(t.queue.remaining).toBe(0);
  });

  it('keeps a ground item in its pile when no player pocket can carry it', () => {
    const t = setup();
    const item = t.add('rag', { kind: 'pile', pos: [0, 0, 0] });

    expect(pocketGroundItem(t.inventory, t.queue, item)).toEqual(expect.any(String));
    expect(t.inventory.locate(item)).toMatchObject({ kind: 'pile' });
    expect(t.queue.busy).toBe(false);
  });

  it('wears a ground backpack through the ordinary worn-slot handling path when the back is free', () => {
    const t = setup();
    const backpack = t.add('school_backpack', { kind: 'pile', pos: [0, 0, 0] });
    const target = { kind: 'worn' } as const;
    const plan = t.inventory.plan(backpack, target);
    if (!plan.ok) {
      throw new Error(plan.reason);
    }

    expect(pocketGroundItem(t.inventory, t.queue, backpack)).toBeUndefined();
    expect(t.queue.jobs[0]).toMatchObject({
      kind: 'move',
      itemUid: backpack.uid,
      target: t.inventory.targetState(target),
      duration: plan.time,
    });
    t.queue.tick(plan.time);
    expect(t.inventory.worn.back).toBe(backpack);
  });

  it('pockets a ground backpack when the back slot is occupied', () => {
    const t = setup();
    const worn = t.add('hiking_backpack', { kind: 'worn' });
    const backpack = t.add('school_backpack', { kind: 'pile', pos: [0, 0, 0] });
    expect(pocketGroundItem(t.inventory, t.queue, backpack)).toBeUndefined();
    const [job] = t.queue.jobs;
    if (!job) {
      throw new Error('Backpack pocketing did not queue a handling job');
    }
    if (job.kind !== 'move') {
      throw new Error('Backpack pocketing queued a non-move handling job');
    }
    expect(job.itemUid).toBe(backpack.uid);
    expect(job.target).toMatchObject({ kind: 'pocket', ownerUid: worn.uid });
    t.queue.tick(job.duration);
    expect(t.inventory.worn.back).toBe(worn);
    expect(t.inventory.locate(backpack)).toMatchObject({ kind: 'pocket', owner: worn });
  });

  it('stows both occupied hands in a backpack before wielding a two-handed item', () => {
    const t = setup();
    const leading = dominantSide(t.inventory.character);
    const secondary = offSide(t.inventory.character);
    const backpack = t.add('school_backpack', { kind: 'worn' });
    const first = t.add('duct_tape', { kind: 'hand', side: leading });
    const second = t.add('rag', { kind: 'hand', side: secondary });
    const type = [...registry.items.values()].find(
      (definition) => definition.twoHanded && definition.id !== WORK_IN_PROGRESS,
    )?.id;
    if (!type) {
      throw new Error('Two-handed fixture is missing');
    }
    const item = t.add(type, { kind: 'pile', pos: [0, 0, 0] });

    expect(toHands(t.inventory, t.queue, item, [0, 0, 0])).toBeUndefined();
    const jobs = [...t.queue.jobs];
    for (const job of jobs) {
      t.queue.tick(job.duration);
    }
    expect(t.inventory.locate(first)).toMatchObject({ kind: 'pocket', owner: backpack });
    expect(t.inventory.locate(second)).toMatchObject({ kind: 'pocket', owner: backpack });
    expect(t.inventory.hands[leading]).toBe(item);
    expect(t.inventory.hands[secondary]).toBeUndefined();
    expect(t.queue.busy).toBe(false);
  });

  it('drops both displaced items when wielding a two-handed item and no pocket fits', () => {
    const t = setup();
    const leading = dominantSide(t.inventory.character);
    const secondary = offSide(t.inventory.character);
    const first = t.add('duct_tape', { kind: 'hand', side: leading });
    const second = t.add('rag', { kind: 'hand', side: secondary });
    const type = [...registry.items.values()].find(
      (definition) => definition.twoHanded && definition.id !== WORK_IN_PROGRESS,
    )?.id;
    if (!type) {
      throw new Error('Two-handed fixture is missing');
    }
    const item = t.add(type, { kind: 'pile', pos: [0, 0, 0] });

    expect(toHands(t.inventory, t.queue, item, [0, 0, 0])).toBeUndefined();
    const jobs = [...t.queue.jobs];
    for (const job of jobs) {
      t.queue.tick(job.duration);
    }
    expect(t.inventory.locate(first)?.kind).toBe('pile');
    expect(t.inventory.locate(second)?.kind).toBe('pile');
    expect(t.inventory.hands[leading]).toBe(item);
    expect(t.inventory.hands[secondary]).toBeUndefined();
    expect(t.queue.busy).toBe(false);
  });

  // The held item goes on the player, else to an empty off hand when neither item needs both hands,
  // else into the wielded item's container, else to the feet.
  // A crate holds only the wielded item, so the held item fits there only in its vacated spot.
  it.each([
    {
      held: 'fixture_tool',
      wielded: 'fixture_other_tool',
      container: 'fixture_cabinet',
      offHand: 'free',
      lands: 'player',
    },
    { held: 'fixture_tool', wielded: 'fixture_pole', container: 'fixture_cabinet', offHand: 'free', lands: 'player' },
    { held: 'fixture_pole', wielded: 'fixture_tool', container: 'fixture_cabinet', offHand: 'free', lands: 'player' },
    {
      held: 'fixture_tool',
      wielded: 'fixture_other_tool',
      container: 'fixture_cabinet',
      offHand: 'free',
      lands: 'offHand',
    },
    {
      held: 'fixture_tool',
      wielded: 'fixture_other_tool',
      container: 'fixture_cabinet',
      offHand: 'busy',
      lands: 'container',
    },
    {
      held: 'fixture_tool',
      wielded: 'fixture_pole',
      container: 'fixture_cabinet',
      offHand: 'free',
      lands: 'container',
    },
    {
      held: 'fixture_pole',
      wielded: 'fixture_tool',
      container: 'fixture_cabinet',
      offHand: 'free',
      lands: 'container',
    },
    {
      held: 'fixture_tool',
      wielded: 'fixture_other_tool',
      container: 'fixture_crate',
      offHand: 'busy',
      lands: 'container',
    },
    { held: 'fixture_bar', wielded: 'fixture_other_tool', container: 'fixture_crate', offHand: 'busy', lands: 'feet' },
  ] as const)(
    'wielding $wielded from $container with the off hand $offHand makes way for held $held: $lands',
    (row) => {
      const { registry: fixtureRegistry, issues } = buildRegistry([
        playerInventorySource(),
        {
          source: 'wield-from-container.json',
          data: {
            items: [
              { id: 'fixture_tool', name: 'Tool', category: 'tool', weight: 1, size: [1, 1] },
              { id: 'fixture_other_tool', name: 'Other tool', category: 'tool', weight: 1, size: [1, 1] },
              { id: 'fixture_pole', name: 'Pole', category: 'tool', weight: 1, size: [1, 3], twoHanded: true },
              { id: 'fixture_bar', name: 'Bar', category: 'tool', weight: 1, size: [1, 2] },
              { id: 'fixture_rag', name: 'Rag', category: 'material', weight: 1, size: [1, 1] },
              {
                id: 'fixture_pack',
                name: 'Pack',
                category: 'bag',
                weight: 1,
                size: [2, 2],
                wearable: { slot: 'back', encumbrance: 0 },
                container: { pockets: [{ grid: [3, 3], handlingSimSeconds: 1 }] },
              },
            ],
            furniture: [
              {
                id: 'fixture_cabinet',
                name: 'Cabinet',
                size: [1, 1, 1],
                color: '#ffffff',
                container: { pockets: [{ grid: [4, 4], handlingSimSeconds: 1 }] },
              },
              {
                id: 'fixture_crate',
                name: 'Crate',
                size: [1, 1, 1],
                color: '#ffffff',
                container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1 }] },
              },
            ],
          },
        },
      ]);
      expect(issues).toEqual([]);
      const t = setup(undefined, fixtureRegistry);
      const leading = dominantSide(t.inventory.character);
      const pack = row.lands === 'player' ? t.add('fixture_pack', { kind: 'worn' }) : undefined;
      const held = t.add(row.held, { kind: 'hand', side: leading });
      if (row.offHand === 'busy') {
        t.add('fixture_rag', { kind: 'hand', side: offSide(t.inventory.character) });
      }
      const container = t.inventory.entities.add({
        type: row.container,
        pos: [1, 0, 0],
        size: [1, 1, 1],
        facing: 'n',
      })!;
      t.inventory.entities.markSearched(container);
      const wielded = t.add(row.wielded, { kind: 'furniture', entity: container, pocket: 0 });

      expect(toHands(t.inventory, t.queue, wielded, [0, 0, 0])).toBeUndefined();
      for (const job of [...t.queue.jobs]) {
        t.queue.tick(job.duration);
      }

      const landed = {
        player: { kind: 'pocket', owner: pack },
        offHand: { kind: 'hand', side: offSide(t.inventory.character) },
        container: { kind: 'furniture', entity: container },
        feet: { kind: 'pile' },
      }[row.lands];
      expect(t.inventory.locate(held)).toMatchObject(landed);
      expect(t.inventory.hands[leading]).toBe(wielded);
      expect(t.queue.busy).toBe(false);
    },
  );

  it.each(['right', 'left'] as const)(
    '%s-dominant deferred toHands take re-plans after freeing its occupied slot',
    (handedness) => {
      const t = setup(handedness);
      const leading = dominantSide(t.inventory.character);
      const jeans = t.add('jeans', { kind: 'worn' });
      const held = t.add('duct_tape', { kind: 'hand', side: leading });
      t.add('flashlight', { kind: 'hand', side: offSide(t.inventory.character) });
      const item = t.add('rag', { kind: 'pile', pos: [0, 0, 0] });
      let pocketTime: number | undefined;
      t.queue.registerAction('fixture.pocket', () => {
        const result = t.inventory.move(item, { kind: 'pocket', owner: jeans, pocket: 0 });
        if (result.ok) {
          const from = t.inventory.locate(item)!;
          pocketTime = t.inventory.handlingTime(item, from, { kind: 'hand', side: leading });
        }
        return result.ok ? undefined : result.reason;
      });
      t.queue.enqueueAction('fixture.pocket', 'Pocket rag', 1);
      expect(toHands(t.inventory, t.queue, item, [0, 0, 0])).toBeUndefined();
      const jobs = [...t.queue.jobs];
      const results = jobs.map((job) => t.queue.tick(job.duration));
      expect(results.flatMap((result) => result.done)).toEqual(jobs);
      expect(results.flatMap((result) => result.failed)).toEqual([]);
      expect(jobs.at(-1)!.duration).toBe(pocketTime);
      expect(t.inventory.locate(held)).toMatchObject({ kind: 'pocket', owner: jeans });
      expect(t.inventory.hands[leading]).toBe(item);
      expect(t.queue.busy).toBe(false);
    },
  );
});

describe('quick move rules', () => {
  it('drops a worn container at the feet with its contents and ordinary take-off time', () => {
    const t = setup();
    const bag = t.add('school_backpack', { kind: 'worn' });
    const beans = t.add('canned_beans', { kind: 'pocket', owner: bag, pocket: 0 });
    const option = quickMove(bag, t.view());
    expect(option.target).toEqual({ kind: 'pile', pos: [0, 0, 0] });
    expect(option.plan).toEqual(t.inventory.plan(bag, option.target));
    expect(option.plan.ok).toBe(true);
    expect(t.queue.enqueue(bag, option.target).ok).toBe(true);
    expect(t.queue.tick(10).failed).toEqual([]);
    expect(t.inventory.locate(bag)?.kind).toBe('pile');
    expect(t.inventory.locate(beans)).toMatchObject({ kind: 'pocket', owner: bag });
  });

  it('stows a left-dominant wielded item in the backpack before clothing pockets', () => {
    const t = setup('left');
    t.add('jeans', { kind: 'worn' });
    const bag = t.add('school_backpack', { kind: 'worn' });
    const item = t.add('canned_beans', { kind: 'hand', side: dominantSide(t.inventory.character) });
    expect(quickMove(item, t.view()).target).toMatchObject({ kind: 'pocket', owner: bag });
  });

  it('quick-move joins a compatible stack in a later pocket before opening an earlier one', () => {
    const t = setupStackReuse();
    const existing = t.add('fixture_units', { kind: 'pocket', owner: t.bag, pocket: 1 }, 2);
    const source = t.add('fixture_units', { kind: 'pile', pos: [0, 0, 0] });
    const move = quickMove(source, t.view());

    expect(move.target).toMatchObject({ kind: 'pocket', owner: t.bag, pocket: 1 });
    expect(move.plan).toMatchObject({ ok: true, merge: existing });
    expect(t.queue.enqueue(source, move.target).ok).toBe(true);
    t.queue.tick(10);

    expect(existing.count).toBeGreaterThan(0);
    expect(t.inventory.locate(existing)).toMatchObject({ kind: 'pocket', owner: t.bag, pocket: 1 });
    expect(t.inventory.itemByUid(source.uid)).toBeUndefined();
  });

  it('quick-move puts an item in a new stack when the earlier stack is full', () => {
    const t = setupStackReuse();
    const full = t.add('fixture_units', { kind: 'pocket', owner: t.bag, pocket: 0 }, 5);
    const source = t.add('fixture_units', { kind: 'pile', pos: [0, 0, 0] });
    const move = quickMove(source, t.view());

    expect(move.target).toMatchObject({ kind: 'pocket', owner: t.bag, pocket: 0 });
    expect(move.plan.ok && move.plan.merge).toBeUndefined();
    expect(t.queue.enqueue(source, move.target).ok).toBe(true);
    t.queue.tick(10);

    expect(full.count).toBeGreaterThan(0);
    expect(source.count).toBeGreaterThan(0);
    expect(t.inventory.locate(full)).toMatchObject({ kind: 'pocket', owner: t.bag, pocket: 0 });
    expect(t.inventory.locate(source)).toMatchObject({ kind: 'pocket', owner: t.bag, pocket: 0 });
  });

  it('keeps a wielded item in hand and returns the fit hint when there is no room', () => {
    const t = setup();
    const item = t.add('canned_beans', { kind: 'hand', side: 'right' });
    const { plan } = quickMove(item, t.view());
    expect(plan.ok).toBe(false);
    expect(plan.ok ? undefined : plan.reason).toBeTruthy();
    expect(t.inventory.hands.right).toBe(item);
  });

  it('takes a floor item into the backpack only after ordinary queued handling time', () => {
    const t = setup();
    const bag = t.add('school_backpack', { kind: 'worn' });
    const item = t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] });
    const option = quickMove(item, t.view());
    expect(option.target).toMatchObject({ kind: 'pocket', owner: bag });
    if (!option.plan.ok) {
      throw new Error(option.plan.reason);
    }
    t.queue.enqueue(item, option.target);
    t.queue.tick(option.plan.time - 0.01);
    expect(t.inventory.locate(item)?.kind).toBe('pile');
    t.queue.tick(0.02);
    expect(t.inventory.locate(item)).toMatchObject({ kind: 'pocket', owner: bag });
  });

  it('falls through to a clothing pocket when no worn bag is available', () => {
    const t = setup();
    const jeans = t.add('jeans', { kind: 'worn' });
    const item = t.add('chocolate_bar', { kind: 'pile', pos: [0, 0, 0] });
    expect(quickMove(item, t.view()).target).toMatchObject({ kind: 'pocket', owner: jeans });
  });

  it('returns the fit hint and leaves a floor item in place when no inventory slot fits', () => {
    const t = setup();
    const item = t.add('canned_beans', { kind: 'pile', pos: [0, 0, 0] });
    const { plan } = quickMove(item, t.view());
    expect(plan.ok).toBe(false);
    expect(plan.ok ? undefined : plan.reason).toBeTruthy();
    expect(t.inventory.locate(item)?.kind).toBe('pile');
  });

  it('wears a floor backpack with its nested contents when the back slot is free', () => {
    const t = setup();
    const bag = t.add('school_backpack', { kind: 'pile', pos: [0, 0, 0] });
    const item = t.add('canned_beans', { kind: 'pocket', owner: bag, pocket: 0 });
    const option = quickMove(bag, t.view());
    expect(option.target).toEqual({ kind: 'worn' });
    t.queue.enqueue(bag, option.target);
    t.queue.tick(10);
    expect(t.inventory.worn.back).toBe(bag);
    expect(t.inventory.locate(item)).toMatchObject({ kind: 'pocket', owner: bag });
  });

  it('moves the whole stack without splitting its UID or count', () => {
    const t = setup();
    t.add('school_backpack', { kind: 'worn' });
    const item = t.add('nails', { kind: 'pile', pos: [0, 0, 0] }, 25);
    t.queue.enqueue(item, quickMove(item, t.view()).target);
    t.queue.tick(10);
    expect(t.inventory.locate(item)?.kind).toBe('pocket');
    expect(item.count).toBe(25);
    expect(t.inventory.itemByUid(item.uid)).toBe(item);
  });

  it('drops the right off-hand item of a left character rather than stowing it', () => {
    const t = setup('left');
    t.add('school_backpack', { kind: 'worn' });
    const item = t.add('flashlight', { kind: 'hand', side: offSide(t.inventory.character) });
    expect(quickMove(item, t.view()).target).toEqual({ kind: 'pile', pos: [0, 0, 0] });
  });
});
