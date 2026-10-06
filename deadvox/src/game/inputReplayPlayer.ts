import type { ReplayAction, ReplayControlSample, ReplayInputData } from './inputReplay.ts';
import { sampleFromReplayFrame } from './inputReplay.ts';

export class InputReplayPlayer {
  private tickIndex = 0;
  private actionIndex = 0;
  readonly inputs: ReplayInputData;
  private readonly dispatch: (action: ReplayAction, sample: ReplayControlSample) => void;

  constructor(inputs: ReplayInputData, dispatch: (action: ReplayAction, sample: ReplayControlSample) => void) {
    this.inputs = inputs;
    this.dispatch = dispatch;
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

  next(): ReplayControlSample | undefined {
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
