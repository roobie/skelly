import { expect, it } from 'vitest';
import { coreMessage } from '../src/core/coreText.ts';
import { Inventory, type Target } from '../src/core/inventory.ts';
import { chargeOf } from '../src/core/lights.ts';
import { freshDropTarget } from '../src/core/options.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { swapCanister } from '../src/core/torch.ts';
import {
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
} from './snapshotTestSupport.ts';

const doorDef = registry.furniture.get('steel_armoury_door')!;
const cut = doorDef.door!.methods.cut!;
const canisterCapacity = registry.items.get('gas_canister')!.canister!.capacity;

const makeRuntime = (snapshot?: Parameters<typeof createRuntime>[0]) => {
  const runtime = createRuntime(snapshot, false, undefined, { spawn: [0, 1, 0], active: false });
  const floor = registry.blockIds.get('planks')!;
  for (let x = -1; x <= 1; x++) {
    for (let z = 0; z <= 6; z++) {
      runtime.world.setBlock(x, 0, z, floor);
    }
  }
  return runtime;
};
type Runtime = ReturnType<typeof makeRuntime>;

const makeDoor = (runtime: Runtime) => {
  const door = runtime.inventory.furnish({
    type: doorDef.id,
    pos: [0, 1, 1],
    size: doorDef.size,
    facing: 'n',
    lock: { id: 'test_armoury', locked: true },
  });
  if (!door) {
    throw new Error('Could not place the fixture steel door');
  }
  return door;
};

/** Holds `type` in the left hand, in place of the starting light. */
const hold = (runtime: Runtime, type: string) => {
  const light = runtime.inventory.hands.left;
  if (!(light && runtime.inventory.consume(light))) {
    throw new Error('Could not free a hand for the fixture tool');
  }
  const tool = runtime.inventory.create(type);
  if (!runtime.inventory.add(tool, { kind: 'hand', side: 'left' })) {
    throw new Error('Could not hold the fixture tool');
  }
  return tool;
};

const holdTorch = (runtime: Runtime, fill?: number) => {
  const torch = hold(runtime, 'blowtorch');
  if (fill !== undefined) {
    const canister = runtime.inventory.create('gas_canister');
    canister.charges = fill;
    runtime.inventory.fitSlot(torch, 'canister', canister);
  }
  return torch;
};

it('a finished cut spends the door method fuel from the torch cartridge', () => {
  const runtime = makeRuntime();
  const door = makeDoor(runtime);
  const torch = holdTorch(runtime, canisterCapacity);
  expect(runtime.session.forceDoor(door, torch.uid)).toBeUndefined();

  // The long action calls the owner's finish when its time is up; waiting out the cut adds no coverage.
  expect(runtime.sim.actions.forcing?.finish(door.uid, torch.uid, 'cut')).toBeUndefined();

  expect(door.lock).toBeUndefined();
  expect(chargeOf(registry, torch)).toBeCloseTo(canisterCapacity - cut.fuel!, 9);
});

it('a cut with too little fill does not start and spends nothing', () => {
  const runtime = makeRuntime();
  const door = makeDoor(runtime);
  const torch = holdTorch(runtime, cut.fuel! / 2);

  const reason = runtime.session.forceDoor(door, torch.uid);

  expect(reason).toBeTypeOf('string');
  expect(runtime.sim.actions.job).toBeUndefined();
  expect(door.lock?.locked).toBe(true);
  expect(chargeOf(registry, torch)).toBe(cut.fuel! / 2);
});

it('a torch with no cartridge cannot start a cut', () => {
  const runtime = makeRuntime();
  const door = makeDoor(runtime);
  const torch = holdTorch(runtime);

  expect(runtime.session.forceDoor(door, torch.uid)).toBeTypeOf('string');
  expect(runtime.sim.actions.job).toBeUndefined();
});

it('a stopped cut spends nothing', () => {
  const runtime = makeRuntime();
  const door = makeDoor(runtime);
  const torch = holdTorch(runtime, canisterCapacity);
  expect(runtime.session.forceDoor(door, torch.uid)).toBeUndefined();
  runtime.sim.scheduler.advance(cut.strikeIntervalSimSeconds * 2);

  runtime.sim.actions.stop();
  runtime.sim.scheduler.advance(1);

  // A stopped job stays defined so its progress survives; its flag is what keeps it from finishing.
  expect(runtime.sim.actions.job?.stopped).toBe(true);
  expect(door.lock?.locked).toBe(true);
  expect(chargeOf(registry, torch)).toBe(canisterCapacity);
});

it('swapping in a cartridge returns the old one whatever its fill', () => {
  const inventory = new Inventory(registry);
  const torch = inventory.create('blowtorch');
  const first = inventory.create('gas_canister');
  first.charges = 0;
  const second = inventory.create('gas_canister');
  const feet = (): Target => ({ kind: 'pile', pos: [0, 0, 0] });
  expect(inventory.add(first, { kind: 'hand', side: 'left' })).toBe(true);
  expect(inventory.add(second, { kind: 'hand', side: 'right' })).toBe(true);

  expect(swapCanister(inventory, torch, first, feet)).toBeUndefined();
  expect(chargeOf(registry, torch)).toBe(0);
  expect(swapCanister(inventory, torch, second, feet)).toBeUndefined();

  expect(chargeOf(registry, torch)).toBe(canisterCapacity);
  expect(inventory.pileAt([0, 0, 0])!.items.map(({ item }) => [item.type, chargeOf(registry, item)])).toEqual([
    ['gas_canister', 0],
  ]);
  expect(swapCanister(inventory, torch, torch, feet)).toBeTypeOf('string');
});

const fittedTorch = () => {
  const inventory = new Inventory(registry);
  const torch = inventory.create('blowtorch');
  const old = inventory.create('gas_canister');
  inventory.fitSlot(torch, 'canister', old);
  const fresh = inventory.create('gas_canister');
  if (!inventory.add(fresh, { kind: 'hand', side: 'left' })) {
    throw new Error('Could not hold the fixture cartridge');
  }
  return { inventory, torch, old, fresh };
};

it('a cartridge swap with no ground for the old one to land on refuses and keeps it fitted', () => {
  const { inventory, torch, old, fresh } = fittedTorch();
  expect(swapCanister(inventory, torch, fresh, () => undefined)).toBe(coreMessage(inventory.registry, 'noLanding'));
  expect(torch.slots!.canister).toBe(old);
  expect(inventory.locate(fresh)?.kind).toBe('hand');
});

it('a refused cartridge swap leaves the fitted cartridge exactly as it was', () => {
  const { inventory, torch, old, fresh } = fittedTorch();
  const before = { ...old };
  expect(swapCanister(inventory, torch, fresh, () => undefined)).toBe(coreMessage(inventory.registry, 'noLanding'));
  expect(old).toEqual(before);
});

it('plans where the old cartridge lands with the fill it comes out with', () => {
  const { inventory, torch, old, fresh } = fittedTorch();
  // The feet pile has room only by merging into a fresh cartridge; the old one's fill, once written, won't merge.
  const feetPile: Target = { kind: 'pile', pos: [0, 0, 0] };
  expect(inventory.add(inventory.create('gas_canister'), feetPile)).toBe(true);
  const fillers = [
    () => inventory.create('blowtorch'),
    () => Object.assign(inventory.create('gas_canister'), { charges: canisterCapacity / 2 }),
  ];
  for (const filler of fillers) {
    while (inventory.add(filler(), feetPile)) {
      // Fill the pile until it refuses.
    }
  }
  expect(swapCanister(inventory, torch, fresh, (item) => freshDropTarget(inventory, item, [0, 0, 0]))).toBeUndefined();
  const at = inventory.locate(old);
  expect(at?.kind).toBe('pile');
  expect(at?.kind === 'pile' && at.pile.pos).not.toEqual([0, 0, 0]);
});

it('a cartridge swap into full piles refuses rather than losing the old one', () => {
  const { inventory, torch, old, fresh } = fittedTorch();
  const pile: Target = { kind: 'pile', pos: [0, 0, 0] };
  const filler = () => Object.assign(inventory.create('gas_canister'), { charges: old.charges });
  while (inventory.add(filler(), pile)) {
    // Fill with the displaced footprint, without merging partly used cartridges.
  }
  expect(swapCanister(inventory, torch, fresh, () => pile)).toBe(coreMessage(inventory.registry, 'noGroundRoom'));
  expect(torch.slots!.canister).toBe(old);
  expect(inventory.locate(fresh)?.kind).toBe('hand');
});

it('a half-used cartridge keeps its fill through a save round-trip', async () => {
  const runtime = makeRuntime();
  const torch = holdTorch(runtime, canisterCapacity / 2);

  const bytes = await encodeFixture(capture(runtime));
  const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
  const loaded = makeRuntime(decoded.snapshot);

  const restored = loaded.inventory.itemByUid(torch.uid);
  expect(restored && chargeOf(registry, restored)).toBe(canisterCapacity / 2);
});
