// Step 1's in-memory boundary: immutable plain data rooted at a world, with its
// one bound character nested underneath. Storage/version identity arrive later.

import type { PlayerState } from '../game/player.ts';
import type { Survival } from '../game/survival.ts';
import type { AimSnapshotState } from './aim.ts';
import type { Character, CharacterState } from './character.ts';
import type { RustleClock } from './foliageRustle.ts';
import { assertFoodExposure, foodMillisecondsAt, settleFoodExposure } from './food.ts';
import type { FootstepClock } from './footsteps.ts';
import type { HandlingQueue, HandlingQueueState } from './handling.ts';
import type { Inventory, InventoryState } from './inventory.ts';
import type { LongActionState } from './longAction.ts';
import type { PlayerCombat, PlayerCombatState } from './playerCombat.ts';
import type { PowerNetwork, PowerState } from './power.ts';
import type { ScenarioRunState } from './scenarioRun.ts';
import type { Simulation, SimulationState } from './sim.ts';
import { freezeSnapshot } from './snapshotData.ts';
import type { SoundPickerState } from './soundPicker.ts';
import { simTimestamp } from './time.ts';
import type { VehicleInstancesState } from './vehicleInstances.ts';
import type { SavedColumn, World } from './world.ts';
import type { ZombieSpawner } from './zombieSpawns.ts';
import type { VocalNoise, ZombieSystem, ZombieSystemState } from './zombies.ts';

export interface SaveSnapshot {
  world: {
    id: string;
    columns: SavedColumn[];
    vehicles: VehicleInstancesState;
    power?: PowerState;
    zombies: ZombieSystemState;
    spawned: readonly string[];
    rolledColumns: readonly string[];
  };
  character: {
    id: string;
    scenarioRun: ScenarioRunState | null;
    progression: CharacterState;
    simulation: SimulationState;
    player: PlayerState;
    aim: AimSnapshotState;
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
  footstepClock: FootstepClock;
  airbornePeakY: number | null;
  rustleClock: { cells: readonly string[]; nextSimTimestamp: number };
  soundPicker: SoundPickerState;
}

export interface SnapshotSessionInput {
  worldId: string;
  power?: PowerNetwork;
  characterId: string;
  scenarioRun: Readonly<ScenarioRunState> | null;
  world: World;
  /** Runtime block number to stable content id. */
  blockContentId: (blockId: number) => string;
  inventory: Inventory;
  character: Character;
  simulation: Simulation;
  player: PlayerState;
  aim: { snapshotState: () => Readonly<AimSnapshotState> };
  survival: Survival;
  quickbar: readonly (number | null)[];
  zombies: ZombieSystem;
  playerCombat: PlayerCombat;
  spawner: ZombieSpawner;
  rolledColumns: ReadonlySet<string>;
  handling: HandlingQueue;
  vocalNoiseId: number;
  vocalNoise?: VocalNoise | undefined;
  footstepClock: FootstepClock;
  airbornePeakY?: number | undefined;
  rustleClock: RustleClock;
  audio: { snapshotState: () => Readonly<SoundPickerState> };
}

/** Takes isolated component copies synchronously; pending handling jobs are omitted only in this copy. */
export const snapshotSession = ({
  worldId,
  power,
  characterId,
  scenarioRun,
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
  rolledColumns,
  handling,
  vocalNoiseId,
  vocalNoise,
  footstepClock,
  airbornePeakY,
  rustleClock,
  audio,
}: SnapshotSessionInput): Readonly<SaveSnapshot> => {
  power?.advance(simTimestamp(simulation.time));
  const foodTimestamp = foodMillisecondsAt(simulation.calendar);
  for (const { item } of inventory.items()) {
    assertFoodExposure(inventory.registry, item);
    settleFoodExposure(item, foodTimestamp);
  }
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
      ...(power ? { power: power.snapshot() } : {}),
      columns: world.snapshotColumns(blockContentId) as SavedColumn[],
      vehicles: inventory.vehicles.snapshotState() as VehicleInstancesState,
      zombies: zombies.snapshotState() as ZombieSystemState,
      spawned: [...spawner.snapshotState()],
      rolledColumns: [...rolledColumns],
    },
    character: {
      id: characterId,
      scenarioRun: structuredClone(scenarioRun),
      progression: character.snapshotState(),
      simulation: simulation.snapshotState() as SimulationState,
      player: structuredClone(player),
      aim: structuredClone(aim.snapshotState()) as AimSnapshotState,
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
        footstepClock: structuredClone(footstepClock),
        airbornePeakY: airbornePeakY ?? null,
        rustleClock: { cells: [...rustleClock.cells].sort(), nextSimTimestamp: rustleClock.nextSimTimestamp },
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
    !Array.isArray(state.soundPicker.events) ||
    !state.footstepClock ||
    !['still', 'walking', 'jogging', 'sprinting'].includes(state.footstepClock.gait) ||
    !Number.isFinite(state.footstepClock.distanceUntilStep) ||
    state.footstepClock.distanceUntilStep < 0 ||
    !Number.isFinite(state.footstepClock.stridePhase) ||
    state.footstepClock.stridePhase < 0 ||
    state.footstepClock.stridePhase >= 1 ||
    !Number.isSafeInteger(state.footstepClock.stepIndex) ||
    state.footstepClock.stepIndex < 0 ||
    (state.airbornePeakY !== null && !Number.isFinite(state.airbornePeakY)) ||
    !state.rustleClock ||
    !Array.isArray(state.rustleClock.cells) ||
    state.rustleClock.cells.some((cell) => typeof cell !== 'string') ||
    !Number.isFinite(state.rustleClock.nextSimTimestamp)
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
    footstepClock: { ...state.footstepClock },
    airbornePeakY: state.airbornePeakY,
    rustleClock: { cells: [...state.rustleClock.cells], nextSimTimestamp: state.rustleClock.nextSimTimestamp },
    soundPicker: structuredClone(state.soundPicker),
  });
};
