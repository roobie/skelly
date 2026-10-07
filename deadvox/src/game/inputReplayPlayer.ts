import { toChunk } from '../core/coords.ts';
import type { ReplayAction, ReplayControlSample, ReplayInputData } from './inputReplay.ts';
import { sampleFromReplayFrame } from './inputReplay.ts';

export const applyReplayLook = (
  look: { yaw: number; pitch: number },
  sample: Pick<ReplayControlSample, 'yaw' | 'pitch'>,
): void => {
  look.yaw = sample.yaw;
  look.pitch = sample.pitch;
};

export class InputReplayPlayer {
  private tickIndex = 0;
  private actionIndex = 0;
  private readinessIndex = 0;
  private readonly readyColumns: Set<string>;
  readonly inputs: ReplayInputData;
  private readonly dispatch: (action: ReplayAction, sample: ReplayControlSample) => void;

  constructor(inputs: ReplayInputData, dispatch: (action: ReplayAction, sample: ReplayControlSample) => void) {
    this.inputs = inputs;
    this.dispatch = dispatch;
    this.readyColumns = new Set(inputs.readyColumns.map(([cx, cz]) => `${cx},${cz}`));
  }

  get finished(): boolean {
    return this.tickIndex >= this.inputs.frames.length;
  }

  get tickCount(): number {
    return this.tickIndex;
  }

  peek(): ReplayControlSample | undefined {
    return this.finished ? undefined : sampleFromReplayFrame(this.inputs.frames[this.tickIndex]!);
  }

  prepareReadinessForNextTick(): void {
    while (
      this.readinessIndex < this.inputs.readinessChanges.length &&
      this.inputs.readinessChanges[this.readinessIndex]![0] === this.tickIndex
    ) {
      const [, cx, cz, ready] = this.inputs.readinessChanges[this.readinessIndex]!;
      const key = `${cx},${cz}`;
      if (ready) {
        this.readyColumns.add(key);
      } else {
        this.readyColumns.delete(key);
      }
      this.readinessIndex += 1;
    }
  }

  isReady(x: number, z: number): boolean {
    return this.readyColumns.has(`${toChunk(Math.floor(x))},${toChunk(Math.floor(z))}`);
  }

  next(): ReplayControlSample | undefined {
    this.prepareReadinessForNextTick();
    if (this.finished) {
      return;
    }
    const sample = sampleFromReplayFrame(this.inputs.frames[this.tickIndex]!);
    while (
      this.actionIndex < this.inputs.actions.length &&
      this.inputs.actions[this.actionIndex]!.tick === this.tickIndex
    ) {
      const action = this.inputs.actions[this.actionIndex]!;
      this.actionIndex += 1;
      this.dispatch(action, sample);
    }
    this.tickIndex += 1;
    return sample;
  }
}
