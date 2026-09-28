// Step 1's in-memory boundary: immutable plain data rooted at a world, with its
// one bound character nested underneath. Storage/version identity arrive later.

import type { PlayerState } from '../game/player.ts';
import type { RestController } from '../game/rest.ts';
import type { Survival } from '../game/survival.ts';
import type { BlockEntitiesState } from './blockEntities.ts';
import type { HandlingQueue, HandlingQueueState } from './handling.ts';
import type { Inventory, InventoryState } from './inventory.ts';
import type { Simulation, SimulationState } from './sim.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { World, WorldDiffs } from './world.ts';
import type { ZombieSpawner } from './zombieSpawns.ts';
import type { ZombieSystem, ZombieSystemState } from './zombies.ts';

export interface SaveSnapshot {
  world: {
    id: string;
    diffs: WorldDiffs;
    zombies: ZombieSystemState;
    spawned: readonly string[];
  };
  character: {
    id: string;
    simulation: SimulationState;
    player: PlayerState;
    inventory: InventoryState;
    rest: { action?: { kind: 'rest' | 'sleep'; label: string; rate: number; startFatigue: number } };
    lightUid: number | null;
    quickbar: readonly (number | null)[];
  };
  handling: HandlingQueueState;
}

export interface SnapshotSessionInput {
  worldId: string;
  characterId: string;
  world: World;
  /** Runtime block number to stable content id. */
  blockContentId: (blockId: number) => string;
  inventory: Inventory;
  simulation: Simulation;
  player: PlayerState;
  rest: RestController;
  survival: Survival;
  quickbar: readonly (number | null)[];
  zombies: ZombieSystem;
  spawner: ZombieSpawner;
  handling: HandlingQueue;
}

/** Takes isolated component copies synchronously; pending handling jobs are omitted only in this copy. */
export const snapshotSession = ({
  worldId,
  characterId,
  world,
  blockContentId,
  inventory,
  simulation,
  player,
  rest,
  survival,
  quickbar,
  zombies,
  spawner,
  handling,
}: SnapshotSessionInput): Readonly<SaveSnapshot> =>
  freezeSnapshot({
    world: {
      id: worldId,
      diffs: world.snapshotDiffs(blockContentId) as WorldDiffs,
      zombies: zombies.snapshotState() as ZombieSystemState,
      spawned: [...spawner.snapshotState()],
    },
    character: {
      id: characterId,
      simulation: simulation.snapshotState() as SimulationState,
      player: structuredClone(player),
      inventory: inventory.snapshotState() as InventoryState,
      rest: rest.snapshotState() as SaveSnapshot['character']['rest'],
      lightUid: survival.snapshotState().litUid ?? null,
      quickbar: [...quickbar],
    },
    handling: handling.snapshotCancelled() as HandlingQueueState,
  });

/** Content-addressed base chunks are regenerated first; this overlays only changed cells. */
export const restoreWorldDiffs = (world: World, snapshot: SaveSnapshot, blockId: (contentId: string) => number): void =>
  world.restoreDiffs(snapshot.world.diffs, blockId);

/** Expose block-entity state by its own type without duplicating it in the envelope. */
export type SavedBlockEntities = BlockEntitiesState;
