import { expect, it } from 'vitest';
import type { Placement, VoxelProvenance } from '../src/core/templates.ts';
import { kitSlice } from '../src/debug/kitOverlay.ts';

it('projects every slice cell without inventing ownership or replacing compiler provenance', () => {
  const record: VoxelProvenance = {
    owner: 'fixture_owner',
    source: 'fixture_source',
    variant: 'fixture_variant',
    slotPath: 'fixture_slot',
    turn: 0,
  };
  const placement: Placement = {
    origin: [10, -4, 20],
    turn: 1,
    template: {
      id: 'fixture',
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      size: [2, 1, 1],
      blocks: new Uint16Array([0, 0]),
      ownership: new Uint8Array([0, 2]),
      reserved: new Uint8Array([0, 1]),
      provenance: [undefined, record],
      pieces: [],
      spawns: [],
    },
  };
  const cells = kitSlice(placement, 0);
  expect(cells).toHaveLength(2);
  expect(cells[0]).toMatchObject({ world: [10, -4, 20], ownership: 0, reserved: false, provenance: undefined });
  expect(cells[1]).toMatchObject({ world: [10, -4, 21], ownership: 2, reserved: true });
  expect(cells[1]!.provenance).toBe(record);
  expect(kitSlice(placement, 1)).toEqual([]);
});
