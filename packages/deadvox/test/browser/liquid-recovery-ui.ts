import type { Registry } from '@skelly/engine/content';
import type { ClockSettings } from '@skelly/engine/internal/core/clock.ts';
import { restoreItem, snapshotItem } from '@skelly/engine/internal/core/items.ts';
import { CraftCommands, craftActionHooks, HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { bindReach, Character, Simulation } from '@skelly/engine/sim';
import { BindingRegistry } from '../../src/game/entries/input.ts';
import { INPUT_BINDINGS } from '../../src/product/controls.ts';
import { InventoryScreen } from '../../src/ui/inventoryScreen.ts';
import { buildFixtureRegistry } from '../economyFixtures.ts';
import { fixtureIds } from '../fixtures/capabilityIds.ts';
import { FULL, RESULT, STOCK, VESSEL } from '../liquidCraftFixture.ts';
import { liquidRecoveryData } from '../liquidRecoveryFixture.ts';

export const mountRecoveryProbe = (base: Registry, clock: ClockSettings) => {
  const built = buildFixtureRegistry([{ source: 'fixture-recovery-browser', data: liquidRecoveryData() }]);
  if (built.issues.length > 0) {
    throw new Error(JSON.stringify(built.issues));
  }
  const registry = {
    ...base,
    items: new Map([...base.items, ...built.registry.items]),
    liquids: new Map([...base.liquids, ...built.registry.liquids]),
    skills: new Map([...base.skills, ...built.registry.skills]),
    recipes: new Map([...base.recipes, ...built.registry.recipes]),
  };
  const character = new Character(registry);
  const inventory = new Inventory(registry, undefined, undefined, character);
  const feet: [number, number, number] = [0, 0, 0];
  const reach = bindReach({ inventory, position: feet, blockSize: 0.5, clock });
  const sim = new Simulation({
    seed: 1,
    registry,
    clock,
    bodyTuning: base.body.get(fixtureIds.player)!,
    compressionCaps: base.compression.get(fixtureIds.player)!.caps,
  });
  const queue = new HandlingQueue(inventory);
  sim.actions.craft = craftActionHooks(inventory, character, reach, { feet: () => feet, calendar: () => sim.calendar });
  const commands = new CraftCommands({ inventory, character, reach, sim, queue });
  const source = restoreItem(registry, {
    ...snapshotItem(inventory.create(RESULT)),
    craftedLiquids: [{ liquid: STOCK, volumeMicrolitres: 4000 }],
  });
  const receiver = inventory.create(VESSEL);
  const donor = inventory.create(FULL);
  if (
    !(
      inventory.add(source, { kind: 'pile', pos: feet }) &&
      inventory.add(receiver, { kind: 'pile', pos: feet }) &&
      inventory.add(donor, { kind: 'pile', pos: feet })
    )
  ) {
    throw new Error('Cannot stage recovery probe');
  }
  const root = document.createElement('section');
  root.id = 'inventory';
  root.dataset.recoveryProbe = '';
  document.body.append(root);
  const screen = new InventoryScreen(root, inventory, queue, {
    bindings: new BindingRegistry(INPUT_BINDINGS),
    reach,
    feet: () => feet,
    nearby: () => [...inventory.piles.values()],
    distance: () => 0,
    containers: () => [],
    entityDistance: () => 0,
    searching: () => false,
    dispatch: (action) =>
      action.kind === 'inventory.work' ? commands.act(action.itemUid, action.operation, action) : undefined,
    notice: () => undefined,
    describe: () => [],
    workOptions: (uid) => commands.options(uid),
    recovery: (uid, choices) => commands.recovery(uid, choices),
    character: () => character,
    body: () => sim.body,
    needs: () => '',
    slotLabels: registry.ui.get(fixtureIds.ui)!.wearSlotLabels,
  });
  screen.selected = source;
  screen.open();
  return { root, screen, inventory, sim, commands, receiver, donor, source, liquid: STOCK };
};
