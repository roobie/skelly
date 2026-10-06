import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { options, toHands } from '../src/core/options.ts';
import { reach } from '../src/core/reach.ts';
import { simSeconds } from '../src/core/time.ts';
import { selectPrimaryAction } from '../src/game/primaryAction.ts';
import { BOX_UNPACK_SECONDS, Unpacking } from '../src/game/unpacking.ts';

const sources = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const { registry, issues } = buildRegistry(sources);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const shellType = 'shell_12_gauge_00_buck';
const payloadCount = 7;
const stackCapacity = 11;
const fixture = (small = false, held = true) => {
  const bagDef = registry.items.get('hiking_backpack')!;
  const packageRegistry = {
    ...registry,
    items: new Map(registry.items)
      .set(shellType, { ...registry.items.get(shellType)!, stack: stackCapacity })
      .set('shotshell_box', {
        ...registry.items.get('shotshell_box')!,
        unpack: { item: shellType, count: payloadCount },
      }),
  };
  const content = small
    ? {
        ...packageRegistry,
        items: new Map(packageRegistry.items).set(bagDef.id, {
          ...bagDef,
          container: {
            pockets: [
              { name: 'Small test pocket', grid: [1, 1] as [number, number], handlingSimSeconds: simSeconds(0) },
            ],
          },
        }),
      }
    : packageRegistry;
  const inventory = new Inventory(content);
  const box = inventory.create('shotshell_box');
  const bag = inventory.create('hiking_backpack');
  if (
    !(
      inventory.add(bag, { kind: 'worn' }) &&
      inventory.add(box, held ? { kind: 'hand', side: 'right' } : { kind: 'pocket', owner: bag, pocket: 0 })
    )
  ) {
    throw new Error('Unpack fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0]);
  return { inventory, box, bag, queue, unpacking };
};

describe('sealed ammunition package activation', () => {
  it('ordinary Hands can put the equipped pump away and wield its sealed box without special-case transfers', () => {
    const f = fixture(false, false);
    const gun = f.inventory.create('pump_shotgun');
    expect(f.inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
    expect(toHands(f.inventory, f.queue, f.box, [0, 0, 0])).toBeUndefined();
    f.queue.tick(f.queue.remaining);
    expect(f.inventory.hands.right).toBe(f.box);
    expect(f.inventory.locate(gun)?.kind).toBe('pocket');
  });
  it('held primary activation yields its authored payload and consumes the noncontainer box', () => {
    const f = fixture();
    expect(f.box.pockets).toBeUndefined();
    expect(selectPrimaryAction(f.inventory)).toMatchObject({ kind: 'unpack', item: f.box });
    expect(f.unpacking.activate(f.box)).toBeUndefined();
    expect([...f.inventory.items()].filter(({ item }) => item.type === shellType)).toEqual([]);
    expect(f.queue.tick(BOX_UNPACK_SECONDS).failed).toEqual([]);
    expect(f.inventory.itemByUid(f.box.uid)).toBeUndefined();
    expect(f.inventory.hands.right).toBeUndefined();
    expect(f.bag.pockets![0]!.map(({ item }) => [item.type, item.count])).toEqual([[shellType, payloadCount]]);
    expect(f.inventory.piles.size).toBe(0);
  });

  it('unpack fills a partial stack and conserves the remainder in an ordinary spill pile', () => {
    const f = fixture(true);
    const freePlaces = Math.floor(payloadCount / 2);
    const initialCount = stackCapacity - freePlaces;
    const shells = f.inventory.create(shellType, initialCount);
    expect(f.inventory.add(shells, { kind: 'pocket', owner: f.bag, pocket: 0 })).toBe(true);
    expect(f.unpacking.activate(f.box)).toBeUndefined();
    expect(f.queue.tick(BOX_UNPACK_SECONDS).failed).toEqual([]);
    expect(shells.count).toBe(stackCapacity);
    const spilled = [...f.inventory.piles.values()].flatMap((pile) => pile.items.map(({ item }) => item));
    expect(spilled).toHaveLength(1);
    expect(spilled[0]?.type).toBe(shellType);
    expect(spilled[0]?.count).toBe(payloadCount - freePlaces);
    expect(shells.count + spilled[0]!.count).toBe(initialCount + payloadCount);
    expect(f.inventory.itemByUid(f.box.uid)).toBeUndefined();
  });

  it('cancelling the opening job preserves the whole box and allocators and produces no loose shells', () => {
    const f = fixture();
    const before = f.inventory.snapshotState();
    expect(f.unpacking.activate(f.box)).toBeUndefined();
    f.queue.tick(BOX_UNPACK_SECONDS / 2);
    f.queue.cancel();
    f.queue.tick(BOX_UNPACK_SECONDS);
    expect(f.inventory.snapshotState()).toEqual(before);
  });

  it('inventory options never expose an enabled Use, Load or Unpack operation even when the box is held', () => {
    const f = fixture();
    const choices = options(f.box, reach({ inventory: f.inventory, position: [0, 0, 0], blockSize: 0.5 }));
    expect(choices.filter((choice) => choice.kind === 'use' && choice.plan.ok)).toEqual([]);
  });

  it('content admission rejects a payload larger than the stack reserved by unpack spill preflight', () => {
    const bad = sources.map((source) => {
      const data = structuredClone(source.data) as { items?: { id: string; unpack?: { count: number } }[] };
      const box = data.items?.find((item) => item.id === 'shotshell_box');
      if (box?.unpack) {
        const payload = registry.items.get(registry.items.get('shotshell_box')!.unpack!.item)!;
        box.unpack.count = (payload.stack ?? 1) + 1;
      }
      return { ...source, data };
    });
    expect(buildRegistry(bad).issues.some((issue) => issue.path.endsWith('.unpack.count'))).toBe(true);
  });
});
