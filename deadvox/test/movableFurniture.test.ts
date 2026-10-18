import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import {
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
} from './snapshotTestSupport.ts';

const crate = registry.furniture.get('crate')!;
const origin: Vec3 = [3, 1, 3];
const spec = { type: crate.id, pos: origin, size: crate.size, facing: 'n' as const };
const moved: Vec3 = [3 + crate.size[0], 1, 3];

const roundTrip = async (runtime: ReturnType<typeof createRuntime>) => {
  const decoded = await decodeSave(await encodeFixture(capture(runtime)), { version: formatVersion, contentLookup });
  return createRuntime(decoded.snapshot);
};

describe('movable furniture', () => {
  it('does not respawn a moved piece when its column generates again', () => {
    const inventory = new Inventory(registry);
    const piece = inventory.furnish(spec)!;
    inventory.entities.lift(piece);
    inventory.entities.place(piece, moved);

    expect(inventory.furnish(spec)).toBeUndefined();
    expect([...inventory.entities.all]).toEqual([piece]);
    expect(inventory.entities.at(...origin)).toBeUndefined();
    expect(inventory.entities.at(...moved)).toBe(piece);
  });

  it('keeps a moved piece where it was put, and its origin claimed, through save and load', async () => {
    const runtime = createRuntime();
    const piece = runtime.inventory.furnish(spec)!;
    runtime.entities.lift(piece);
    runtime.entities.place(piece, moved);

    const loaded = await roundTrip(runtime);
    const restored = loaded.entities.byUid(piece.uid)!;
    expect(restored).toMatchObject({ origin, pos: moved, carried: false });
    expect(loaded.entities.at(...moved)).toBe(restored);
    expect(loaded.inventory.furnish(spec)).toBeUndefined();
  });

  it('keeps a carried piece and what it holds in hand through save and load', async () => {
    const runtime = createRuntime();
    const piece = runtime.inventory.furnish(spec, [{ type: 'canned_beans', count: 1, condition: 1 }])!;
    const [beans] = piece.pockets!.flat();
    runtime.entities.lift(piece);

    const loaded = await roundTrip(runtime);
    const restored = loaded.entities.carrying()!;
    expect(restored).toMatchObject({ uid: piece.uid, origin, carried: true });
    expect([...loaded.entities.all]).not.toContain(restored);
    expect(loaded.entities.at(...origin)).toBeUndefined();
    expect(loaded.inventory.itemByUid(beans!.item.uid)).toBeDefined();
  });
});
