import { skipTarget } from '../core/clock.ts';
import { SKIP_COMPRESSION } from '../core/compression.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import type { Simulation } from '../core/sim.ts';
import type { RealSeconds, SimSeconds } from '../core/time.ts';
import { advanceLiveFrame } from './frameDriver.ts';
import {
  type InputReplayRecorder,
  type ReplayGeneratedColumn,
  type ReplayStartState,
  replayStateFingerprint,
  rolloverInputReplayRecorder,
} from './inputReplay.ts';
import type { InputReplayDriver } from './inputReplayDriver.ts';
import type { InputReplayPlayer } from './inputReplayPlayer.ts';

export type InputReplayVerification = 'matched' | 'diverged' | 'unavailable' | undefined;
const INPUT_REPLAY_COLUMN_OVERFLOW_STOP_REASON =
  'a streamed-column batch exceeded the recording window; the recent replay was discarded';
export const inputReplayStoppedStatus = (reason: string): string => `Recording stopped: ${reason}`;
/** Sim seconds of slack for a debug time skip "reaching its target"; the clamped last frame lands within float error of it. */
const SKIP_SLACK = 1e-6;

/** The live input recording windows; play's action routing queues into them and the stepper rolls them. */
export interface InputRecording {
  recorder: InputReplayRecorder | undefined;
  previous: InputReplayRecorder | undefined;
  stoppedReason: string | undefined;
}

/** What one step has to say to the player; the presentation decides how to show it. */
interface SimulationStepEvent {
  readonly kind: 'notice';
  readonly text: string;
}

interface SimulationStepResult {
  /** Whether the debug game freeze is on; presentation steps noclip flight and freezes actor drawing by it. */
  readonly gameFrozen: boolean;
  readonly events: readonly SimulationStepEvent[];
}

export interface SimulationStepperPorts {
  readonly sim: Simulation;
  readonly advance: (simDt: SimSeconds, until?: number) => void;
  readonly worldReady: () => boolean;
  readonly gameFrozen: () => boolean;
  readonly replayPlayer: InputReplayPlayer | undefined;
  readonly replayDriver: InputReplayDriver | undefined;
  readonly replay: { readonly endStateFingerprint: string; readonly endSimTimestamp: number } | undefined;
  readonly recording: InputRecording;
  readonly captureSnapshot: () => Readonly<SaveSnapshot>;
  readonly generatedColumns: () => readonly ReplayGeneratedColumn[];
  readonly captureReplayStartState: () => ReplayStartState;
}

export interface SimulationStepper {
  /** Advances the simulation by one Real frame, from live input or the replay being played. */
  step: (realDt: RealSeconds, options: { readonly menuPaused: boolean }) => SimulationStepResult;
  /** Debug: pushes the time-skip target out by `hours` and runs the clock at skip compression. */
  skipGameHours: (hours: number) => void;
  /** Discards the recording when a player tick's column changes cannot fit a window; its notice joins the step's events. */
  stopRecordingForColumnOverflow: () => void;
  readonly replayVerification: InputReplayVerification;
  readonly replayVerificationTick: number | undefined;
}

/**
 * One frame's simulation advance, free of the browser so another front end or a server can drive it.
 * The order within a step is the simulation's order: column-overflow rollover, then the replay or
 * live advance, then the skip check, then the full-window rollover.
 */
export const createSimulationStepper = (ports: SimulationStepperPorts): SimulationStepper => {
  const { sim, replayPlayer, replayDriver, replay, recording } = ports;
  const { compression } = sim;
  let replayVerification: InputReplayVerification;
  let replayVerificationTick: number | undefined;
  let replayVerificationStarted = false;
  /** Debug time skip: the simulation time it runs to, while one is running. */
  let skipUntil: number | undefined;
  /** Events raised since the last step returned, including those from player ticks inside the advance. */
  const events: SimulationStepEvent[] = [];

  /** Ends the skip exactly on target: snapping c to 1 keeps the ramp-down from running past it. */
  const endSkip = (): void => {
    skipUntil = undefined;
    compression.stop();
    compression.snap();
  };

  /** Ends the skip when it arrives, is interrupted, the player dies or the debug T key stops compression. */
  const updateSkip = (until: number): void => {
    const { interruption } = compression;
    if (interruption !== undefined) {
      events.push({ kind: 'notice', text: `Time skip stopped: ${interruption}` });
    }
    if (interruption !== undefined || sim.dead || !compression.active || until - sim.time <= SKIP_SLACK) {
      endSkip();
    }
  };

  const verifyReplayEndState = (): void => {
    if (!(replayPlayer?.finished && !replayVerificationStarted)) {
      return;
    }
    replayVerificationStarted = true;
    replayVerificationTick = replayPlayer.tickCount;
    const finalSnapshot = ports.captureSnapshot();
    sim.paused = true;
    replayStateFingerprint(finalSnapshot).then(
      (actual) => {
        replayVerification = actual === replay?.endStateFingerprint ? 'matched' : 'diverged';
      },
      () => {
        replayVerification = 'unavailable';
      },
    );
  };

  const stepReplaySimulation = (realDt: RealSeconds, menuPaused: boolean, gameFrozen: boolean): void => {
    sim.paused = menuPaused || gameFrozen || replayPlayer?.finished === true || replayVerification === 'unavailable';
    if (sim.paused || !replayPlayer || !replayDriver) {
      return;
    }
    if (replayDriver.advanceFrame(realDt).kind === 'unavailable') {
      replayVerification = 'unavailable';
      sim.paused = true;
      return;
    }
    if (replayPlayer.finished) {
      replayDriver.advanceEndRemainder(replay!.endSimTimestamp);
    }
    verifyReplayEndState();
  };

  const stopInputRecordingForColumnOverflow = (): void => {
    recording.stoppedReason = INPUT_REPLAY_COLUMN_OVERFLOW_STOP_REASON;
    recording.recorder = undefined;
    recording.previous = undefined;
    events.push({
      kind: 'notice',
      text: `Replay ${inputReplayStoppedStatus(recording.stoppedReason).toLowerCase()}.`,
    });
  };

  const rollInputRecorderWindow = (): void => {
    if (!recording.recorder) {
      return;
    }
    const previousRecorder = recording.recorder;
    recording.previous = previousRecorder;
    recording.recorder = rolloverInputReplayRecorder(
      previousRecorder,
      ports.captureSnapshot(),
      ports.generatedColumns(),
      ports.captureReplayStartState(),
    );
  };

  const handleInputRecorderColumnOverflow = (): void => {
    if (replayPlayer || !recording.recorder?.columnChangesWouldOverflow) {
      return;
    }
    if (recording.recorder.pendingColumnChangesExceedWindow) {
      stopInputRecordingForColumnOverflow();
    } else {
      rollInputRecorderWindow();
    }
  };

  const step = (realDt: RealSeconds, { menuPaused }: { readonly menuPaused: boolean }): SimulationStepResult => {
    if (!ports.worldReady()) {
      sim.paused = true;
      return { gameFrozen: false, events: events.splice(0) };
    }
    handleInputRecorderColumnOverflow();
    // The freeze stops the sim like the pause menu does, but without the overlay or pointer release.
    const gameFrozen = ports.gameFrozen();
    if (replayPlayer) {
      stepReplaySimulation(realDt, menuPaused, gameFrozen);
    } else {
      sim.paused = menuPaused || gameFrozen;
      advanceLiveFrame(sim, realDt, skipUntil, ports.advance);
    }
    // A running time skip simply waits out the freeze: a paused sim.frame leaves its target and compression alone.
    if (skipUntil !== undefined) {
      updateSkip(skipUntil);
    }
    if (!replayPlayer && recording.recorder?.full) {
      rollInputRecorderWindow();
    }
    return { gameFrozen, events: events.splice(0) };
  };

  return {
    step,
    stopRecordingForColumnOverflow: stopInputRecordingForColumnOverflow,
    skipGameHours: (hours) => {
      skipUntil = skipTarget(sim.clock, skipUntil ?? sim.time, hours);
      sim.compress(SKIP_COMPRESSION);
    },
    get replayVerification() {
      return replayVerification;
    },
    get replayVerificationTick() {
      return replayVerificationTick;
    },
  };
};
