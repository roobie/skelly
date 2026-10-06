// Step 1's in-memory boundary: immutable plain data rooted at a world, with its
// one bound character nested underneath. Storage/version identity arrive later.

import type { PlayerState } from '../game/player.ts';
import type { Survival } from '../game/survival.ts';
import type { AimState } from './aim.ts';
import type { Character, CharacterState } from './character.ts';
import type { HandlingQueue, HandlingQueueState } from './handling.ts';
import type { Inventory, InventoryState } from './inventory.ts';
import type { LongActionState } from './longAction.ts';
import type { PlayerCombat, PlayerCombatState } from './playerCombat.ts';
import type { Simulation, SimulationState } from './sim.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { SoundPickerState } from './soundPicker.ts';
import type { World, WorldDiffs } from './world.ts';
import type { ZombieSpawner } from './zombieSpawns.ts';
import type { VocalNoise, ZombieSystem, ZombieSystemState } from './zombies.ts';

export interface SaveSnapshot {
  world: {
    id: string;
    diffs: WorldDiffs;
    zombies: ZombieSystemState;
    spawned: readonly string[];
  };
  character: {
    id: string;
    progression: CharacterState;
    simulation: SimulationState;
    player: PlayerState;
    aim: AimState;
    inventory: InventoryState;
    longAction: LongActionState;
    playerCombat: PlayerCombatState;
    lightUid: number | null;
    quickbar: readonly (number | null)[];
    handling: HandlingQueueState;
    playerAudio: PlayerAudioSnapshot;
  };
}

export interface PlayerAudioSnapshot {
  vocalNoiseId: number;
  vocalNoise: VocalNoise | null;
  soundPicker: SoundPickerState;
}

export interface SnapshotSessionInput {
  worldId: string;
  characterId: string;
  world: World;
  /** Runtime block number to stable content id. */
  blockContentId: (blockId: number) => string;
  inventory: Inventory;
  character: Character;
  simulation: Simulation;
  player: PlayerState;
  aim: { snapshotState: () => Readonly<AimState> };
  survival: Survival;
  quickbar: readonly (number | null)[];
  zombies: ZombieSystem;
  playerCombat: PlayerCombat;
  spawner: ZombieSpawner;
  handling: HandlingQueue;
  vocalNoiseId: number;
  vocalNoise?: VocalNoise | undefined;
  audio: { snapshotState: () => Readonly<SoundPickerState> };
}

/** Takes isolated component copies synchronously; pending handling jobs are omitted only in this copy. */
export const snapshotSession = ({
  worldId,
  characterId,
  world,
  blockContentId,
  inventory,
  character,
  simulation,
  player,
  aim,
  survival,
  quickbar,
  zombies,
  playerCombat,
  spawner,
  handling,
  vocalNoiseId,
  vocalNoise,
  audio,
}: SnapshotSessionInput): Readonly<SaveSnapshot> => {
  const lightUid = survival.snapshotState().litUid ?? null;
  // Check non-owning references at the synchronous snapshot barrier, not only during restore.
  for (const uid of [lightUid, ...quickbar]) {
    if (uid !== null && !inventory.itemByUid(uid)) {
      throw new Error(`Snapshot contains dangling item UID ${uid}`);
    }
  }
  return freezeSnapshot({
    world: {
      id: worldId,
      diffs: world.snapshotDiffs(blockContentId) as WorldDiffs,
      zombies: zombies.snapshotState() as ZombieSystemState,
      spawned: [...spawner.snapshotState()],
    },
    character: {
      id: characterId,
      progression: character.snapshotState(),
      simulation: simulation.snapshotState() as SimulationState,
      player: structuredClone(player),
      aim: structuredClone(aim.snapshotState()) as AimState,
      inventory: inventory.snapshotState() as InventoryState,
      longAction: simulation.actions.snapshotState(),
      playerCombat: playerCombat.snapshotState(),
      lightUid,
      quickbar: [...quickbar],
      handling: handling.snapshotCancelled() as HandlingQueueState,
      playerAudio: {
        vocalNoiseId,
        vocalNoise:
          vocalNoise === undefined || simulation.time > vocalNoise.expiresAt
            ? null
            : {
                id: vocalNoise.id,
                pos: [...vocalNoise.pos],
                radiusMetres: vocalNoise.radiusMetres,
                expiresAt: vocalNoise.expiresAt,
              },
        soundPicker: audio.snapshotState() as SoundPickerState,
      },
    },
  });
};

export const restorePlayerAudioState = (state: PlayerAudioSnapshot): Readonly<PlayerAudioSnapshot> => {
  if (
    !(state && Number.isSafeInteger(state.vocalNoiseId)) ||
    state.vocalNoiseId < 0 ||
    !state.soundPicker ||
    !Array.isArray(state.soundPicker.events)
  ) {
    throw new Error('Invalid player audio state');
  }
  const noise = state.vocalNoise;
  if (
    noise !== null &&
    (!(noise && Number.isSafeInteger(noise.id)) ||
      noise.id < 1 ||
      noise.id > state.vocalNoiseId ||
      !Array.isArray(noise.pos) ||
      noise.pos.length !== 3 ||
      noise.pos.some((value) => !Number.isFinite(value)) ||
      !Number.isFinite(noise.radiusMetres) ||
      noise.radiusMetres <= 0 ||
      !Number.isFinite(noise.expiresAt))
  ) {
    throw new Error('Invalid active vocal noise');
  }
  return freezeSnapshot({
    vocalNoiseId: state.vocalNoiseId,
    vocalNoise:
      noise === null
        ? null
        : {
            id: noise.id,
            pos: [...noise.pos],
            radiusMetres: noise.radiusMetres,
            expiresAt: noise.expiresAt,
          },
    soundPicker: structuredClone(state.soundPicker),
  });
};
