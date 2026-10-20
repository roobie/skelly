import type { ReplayColumnChange, ReplayControlSample } from './inputReplay.ts';
import type { InputReplayPlayer } from './inputReplayPlayer.ts';
import { applyReplayLook } from './inputReplayPlayer.ts';
import { PHYSICS_RATE } from './session.ts';

export interface InputReplayDriverPorts {
  readonly player: Pick<InputReplayPlayer, 'finished' | 'inputs' | 'peek' | 'takePreparedColumnChanges'>;
  readonly terrain: {
    hasGeneratedColumn: (cx: number, cz: number) => boolean;
    generateForReplay: (cx: number, cz: number) => boolean;
    unloadForReplay: (cx: number, cz: number) => void;
    isReady: (x: number, z: number) => boolean;
  };
  readonly onColumnLoad: (cx: number, cz: number) => void;
  readonly onColumnUnload: (cx: number, cz: number) => void;
  readonly simulation: {
    readonly currentSimSeconds: () => number;
    readonly nextPlayerTickEnd: () => number;
    readonly compression: { c: number; limits: { maxSimPerFrame: number } };
  };
  readonly frameReplay: (realSeconds: number) => void;
  readonly playerPosition: () => readonly [number, number, number];
}

export type InputReplayFrameResult =
  | { readonly kind: 'advanced' | 'finished'; readonly simSeconds: number }
  | { readonly kind: 'unavailable'; readonly simSeconds: number };

const PLAYER_TICK_SECONDS = 1 / PHYSICS_RATE;

export const nextReplayInputSample = (
  player: Pick<InputReplayPlayer, 'next'>,
  compression: { c: number },
  look: { yaw: number; pitch: number },
): { readonly input: ReplayControlSample; readonly recordedSample: ReplayControlSample | undefined } => {
  const recordedSample = player.next();
  if (recordedSample) {
    compression.c = recordedSample.compression;
    applyReplayLook(look, recordedSample);
    return { input: recordedSample, recordedSample };
  }
  return {
    input: {
      active: false,
      inputLocked: true,
      intent: {
        forward: 0,
        right: 0,
        jump: false,
        sprint: false,
        walk: false,
        useDominant: false,
        useDominantHeld: false,
        useOff: false,
      },
      yaw: look.yaw,
      pitch: look.pitch,
      walking: false,
      descending: false,
      worldReady: false,
      compression: compression.c,
    },
    recordedSample: undefined,
  };
};

type ReplayTickResult = InputReplayFrameResult;

export class InputReplayDriver {
  private readonly ports: InputReplayDriverPorts;
  private initializedColumns = false;
  private tickRemainder = 0;

  constructor(ports: InputReplayDriverPorts) {
    this.ports = ports;
  }

  initializeColumns(): boolean {
    if (this.initializedColumns) {
      return true;
    }
    const { player, terrain, onColumnLoad } = this.ports;
    const columns = [...player.inputs.generatedColumns].sort(([ax, az], [bx, bz]) => ax - bx || az - bz);
    for (const [cx, cz] of columns) {
      if (!(terrain.hasGeneratedColumn(cx, cz) || terrain.generateForReplay(cx, cz))) {
        return false;
      }
    }
    for (const [cx, cz] of columns) {
      onColumnLoad(cx, cz);
    }
    this.initializedColumns = true;
    return true;
  }

  advanceFrame(realSeconds: number): InputReplayFrameResult {
    const { player, simulation } = this.ports;
    if (player.finished) {
      return { kind: 'finished', simSeconds: 0 };
    }
    if (!this.initializeColumns()) {
      return { kind: 'unavailable', simSeconds: 0 };
    }

    const frameCompression = player.peek()?.compression ?? 1;
    this.tickRemainder += Math.min(realSeconds * frameCompression, simulation.compression.limits.maxSimPerFrame);
    let advancedSeconds = 0;
    while (this.tickRemainder >= PLAYER_TICK_SECONDS && !player.finished) {
      const tick = this.advanceTick();
      if (tick.kind === 'unavailable') {
        return { kind: 'unavailable', simSeconds: advancedSeconds };
      }
      if (tick.kind === 'finished' || tick.simSeconds === 0) {
        break;
      }
      this.tickRemainder -= tick.simSeconds;
      advancedSeconds += tick.simSeconds;
    }
    return { kind: player.finished ? 'finished' : 'advanced', simSeconds: advancedSeconds };
  }

  advanceEndRemainder(endSimTimestamp: number): void {
    const { player, simulation, frameReplay } = this.ports;
    if (player.finished) {
      const remainder = endSimTimestamp - simulation.currentSimSeconds();
      if (remainder > 0) {
        frameReplay(remainder / simulation.compression.c);
      }
    }
  }

  private advanceTick(): ReplayTickResult {
    const { player, terrain, simulation, frameReplay, playerPosition } = this.ports;
    if (!this.applyColumnChanges(player.takePreparedColumnChanges())) {
      return { kind: 'unavailable', simSeconds: 0 };
    }
    const sample: ReplayControlSample | undefined = player.peek();
    if (!sample) {
      return { kind: 'finished', simSeconds: 0 };
    }
    const [x, , z] = playerPosition();
    if (sample.worldReady && !terrain.isReady(x, z)) {
      return { kind: 'unavailable', simSeconds: 0 };
    }
    simulation.compression.c = sample.compression;
    const timeBefore = simulation.currentSimSeconds();
    const tickEnd = simulation.nextPlayerTickEnd();
    frameReplay(Math.max(0, tickEnd - timeBefore) / sample.compression);
    return { kind: 'advanced', simSeconds: simulation.currentSimSeconds() - timeBefore };
  }

  private applyColumnChanges(changes: readonly ReplayColumnChange[]): boolean {
    const { terrain, onColumnLoad, onColumnUnload } = this.ports;
    for (const [, cx, cz, generated] of changes) {
      if (generated) {
        if (!(terrain.hasGeneratedColumn(cx, cz) || terrain.generateForReplay(cx, cz))) {
          return false;
        }
        onColumnLoad(cx, cz);
      } else {
        terrain.unloadForReplay(cx, cz);
        onColumnUnload(cx, cz);
      }
    }
    return true;
  }
}
