import { describe, expect, it } from 'vitest';
import { type RecoveryTarget, selectRecoveryOperation } from '../src/core/disassembly.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';

const built = buildRegistry([
  playerInventorySource(),
  {
    source: 'recovery-fixture',
    data: {
      skills: [{ id: 'fixture_connections', name: 'Connections' }],
      items: [
        {
          id: 'fixture_hinged_panel',
          name: 'Hinged panel',
          category: 'material',
          weight: 1,
          size: [1, 1],
          disassembly: {
            skill: 'fixture_connections',
            timeGameMinutes: 2,
            yields: [{ item: 'fixture_hinge', count: 1, fractions: [0.5, 1], rounding: 'ceil' }],
          },
          salvage: [{ item: 'fixture_splinters', count: 1 }],
          salvageTimeGameMinutes: 1,
        },
        { id: 'fixture_hinge', name: 'Hinge', category: 'material', weight: 1, size: [1, 1] },
        { id: 'fixture_splinters', name: 'Splinters', category: 'material', weight: 1, size: [1, 1] },
      ],
    },
  },
]);
if (built.issues.length > 0) {
  throw new Error(JSON.stringify(built.issues));
}
const { registry } = built;
const panel = registry.items.get('fixture_hinged_panel')!;

describe('explicit recovery operation selection', () => {
  it('selects each coexisting authored capability without generating or transferring parts', () => {
    const target: RecoveryTarget = { kind: 'definition', definition: panel };
    expect(selectRecoveryOperation(target, 'salvage')).toEqual({
      status: 'ready',
      target,
      outcome: {
        operation: 'salvage',
        outputs: panel.salvage,
        timeGameMinutes: panel.salvageTimeGameMinutes,
      },
    });
    expect(selectRecoveryOperation(target, 'disassembly')).toEqual({
      status: 'ready',
      target,
      outcome: { operation: 'disassembly', capability: panel.disassembly },
    });
  });

  it('does not substitute salvage when disassembly is unsupported', () => {
    const target: RecoveryTarget = {
      kind: 'definition',
      definition: { ...panel, disassembly: undefined },
    };
    expect(selectRecoveryOperation(target, 'salvage').status).toBe('ready');
    expect(selectRecoveryOperation(target, 'disassembly')).toEqual({
      status: 'unsupported',
      target,
      operation: 'disassembly',
    });
  });

  it('refuses supported work on an unreachable exact item, without changing its owner or choosing salvage', () => {
    const inventory = new Inventory(registry);
    const position: [number, number, number] = [0, 0, 0];
    const reach = bindReach({ inventory, position, blockSize: 0.5, clock: BASE_CLOCK });
    const source = inventory.create(panel.id);
    const target: RecoveryTarget = { kind: 'item', source, reach: reach() };
    expect(selectRecoveryOperation(target, 'disassembly')).toEqual({
      status: 'refused',
      target,
      operation: 'disassembly',
      reason: 'unreachable',
    });
    expect(source.work).toBeUndefined();
    expect(inventory.add(source, { kind: 'pile', pos: position })).toBe(true);
    const available = selectRecoveryOperation({ ...target, reach: reach() }, 'disassembly');
    expect(available.status).toBe('ready');
    if (available.status !== 'ready') {
      throw new Error('Expected supported reachable work');
    }
    expect(available.outcome.operation).toBe('disassembly');
    expect(inventory.itemByUid(source.uid)).toBe(source);
  });
});
