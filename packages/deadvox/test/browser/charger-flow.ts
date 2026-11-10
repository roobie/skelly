import type { Registry } from '@skelly/engine/content';
import { batteryEnergy, toHands } from '@skelly/engine/inventory';
import { decodeSave, encodeSave } from '@skelly/engine/save';
import { BindingRegistry } from '../../src/game/bindingRegistry.ts';
import type { ReplayActionPayload } from '../../src/game/replayCommands.ts';
import { fetchActorFigureFiles } from '../../src/presentation/play.ts';
import { productAssets } from '../../src/product/assets.ts';
import { INPUT_BINDINGS } from '../../src/product/controls.ts';
import { chargerPanel } from '../../src/ui/chargerPanel.ts';
import { InventoryScreen } from '../../src/ui/inventoryScreen.ts';
import { contentLookup } from '../../src/ui/saveController.ts';
import { fixtureIds } from '../fixtures/capabilityIds.ts';
import { createChargerSession } from '../fixtures/chargerSession.ts';

const queueMove = (
  session: ReturnType<typeof createChargerSession>['session'],
  payload: Extract<ReplayActionPayload, { kind: 'inventory.move' }>,
): string | undefined => {
  const item = session.inventory.itemByUid(payload.itemUid);
  const target = session.inventory.resolveTarget(payload.target);
  if (!(item && target)) {
    throw new Error('Missing charger handling target');
  }
  const plan = session.queue.enqueue(item, target, payload.count);
  return plan.ok ? undefined : plan.reason;
};

// The stage passes the save schema version: no engine entry carries it, and deadvox reaches the engine only as a package.
export const mountChargerFlow = async (base: Registry, root: HTMLElement, schemaVersion: number) => {
  const figures = await fetchActorFigureFiles(base, productAssets.figures);
  let runtime = createChargerSession(base, figures);
  let screen: InventoryScreen;
  const refusals: string[] = [];
  const version = {
    simulationHash: 'a'.repeat(64),
    schemaVersion,
    generators: {
      worldgen: 'worldgen-v2',
      'bodyPlan.humanoid': 'humanoid-figure-v1',
      'bodyPlan.fused-mass': 'fused-mass-figure-v1',
    },
    contentPacks: [{ id: 'fixture', version: '1', canonicalHash: '0'.repeat(64) }],
  };
  const mount = () => {
    const { session } = runtime;
    const { inventory } = session;
    screen = new InventoryScreen(root, inventory, session.queue, {
      bindings: new BindingRegistry(INPUT_BINDINGS),
      reach: session.reach,
      feet: () => session.reach().feet,
      nearby: () => session.reach().piles,
      distance: () => 0,
      containers: () => session.reach().furniture,
      entityDistance: () => 0,
      searching: () => false,
      notice: (reason) => refusals.push(reason),
      describe: () => [],
      workOptions: () => [],
      body: () => session.sim.body,
      character: () => session.character,
      needs: () => '',
      slotLabels: runtime.registry.ui.get(fixtureIds.ui)!.wearSlotLabels,
      charger: (entity) => chargerPanel(entity, session.power, session.reach()),
      chargerRevision: () => session.sim.time,
      dispatch: (payload) => {
        let reason: string | undefined;
        switch (payload.kind) {
          case 'charger.start':
            reason = session.chargerControl(payload.entityUid, 'start');
            break;
          case 'charger.stop':
            reason = session.chargerControl(payload.entityUid, 'stop');
            break;
          case 'inventory.move':
            reason = queueMove(session, payload);
            break;
          case 'inventory.to-hands': {
            const item = inventory.itemByUid(payload.itemUid);
            if (!item) {
              throw new Error('Missing collectible cell');
            }
            reason = toHands(inventory, session.queue, item, payload.feet);
            break;
          }
          default:
            throw new Error('Unexpected charger control');
        }
        if (reason) {
          refusals.push(reason);
        }
        screen.update();
        return reason;
      },
    });
    screen.open();
  };
  const cell = runtime.session.inventory.create(runtime.batteryType);
  cell.charges = 0;
  if (!runtime.session.inventory.add(cell, { kind: 'hand', side: 'right' })) {
    throw new Error('Missing cell supply');
  }
  mount();
  return {
    advance: (seconds: number) => {
      runtime.advance(seconds);
      screen.update();
    },
    blackout: (off: boolean) => {
      runtime.blackout(off);
      screen.update();
    },
    move: (direction: number) => runtime.move(direction),
    reload: async () => {
      const bytes = await encodeSave(runtime.snapshot(), {
        generation: 1,
        version,
        worldOptions: { blockSize: 0.5, site: 'forest', storeys: 1, density: 0.75 },
      });
      const saved = await decodeSave(bytes, {
        version,
        contentLookup: (kind, id) => contentLookup(runtime.registry, kind, id),
      });
      screen.close();
      runtime = createChargerSession(base, figures, saved.snapshot);
      mount();
    },
    inspect: () => {
      const item = runtime.session.inventory.itemByUid(cell.uid)!;
      return {
        energy: batteryEnergy(runtime.registry, item),
        uid: item.uid,
        active: Boolean(runtime.entity!.charging),
        hands: Object.values(runtime.session.inventory.hands).map((held) => held?.uid),
        pos: [...runtime.session.body.pos],
        owned: runtime.entity!.pockets!.flat().map(({ item: owned }) => owned.uid),
        jobs: runtime.session.queue.jobs.length,
        refusals: [...refusals],
      };
    },
  };
};
