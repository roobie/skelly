import { toChunk } from '../core/coords.ts';
import type {
  ReplayAction,
  ReplayColumnChange,
  ReplayControlSample,
  ReplayGeneratedColumn,
  ReplayInputData,
} from './inputReplay.ts';
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
  private columnChangeIndex = 0;
  private readonly generated: Set<string>;
  private preparedColumnChanges: ReplayColumnChange[] = [];
  readonly inputs: ReplayInputData;
  private readonly dispatch: (action: ReplayAction, sample: ReplayControlSample) => void;

  constructor(inputs: ReplayInputData, dispatch: (action: ReplayAction, sample: ReplayControlSample) => void) {
    this.inputs = inputs;
    this.dispatch = dispatch;
    this.generated = new Set(inputs.generatedColumns.map(([cx, cz]) => `${cx},${cz}`));
    this.preparedColumnChanges = this.prepareColumnChangesForNextTick();
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

  private prepareColumnChangesForNextTick(): ReplayColumnChange[] {
    const changes: ReplayColumnChange[] = [];
    while (
      this.columnChangeIndex < this.inputs.columnChanges.length &&
      this.inputs.columnChanges[this.columnChangeIndex]![0] === this.tickIndex
    ) {
      const change = this.inputs.columnChanges[this.columnChangeIndex]!;
      const [, cx, cz, isGenerated] = change;
      const key = `${cx},${cz}`;
      if (isGenerated) {
        this.generated.add(key);
      } else {
        this.generated.delete(key);
      }
      changes.push(change);
      this.columnChangeIndex += 1;
    }
    return changes;
  }

  takePreparedColumnChanges(): readonly ReplayColumnChange[] {
    const changes = this.preparedColumnChanges;
    this.preparedColumnChanges = [];
    return changes;
  }

  generatedColumns(): ReplayGeneratedColumn[] {
    return [...this.generated]
      .map((key) => key.split(',').map(Number) as [number, number])
      .sort(([ax, az], [bx, bz]) => ax - bx || az - bz);
  }

  isReady(x: number, z: number): boolean {
    const cx = toChunk(Math.floor(x));
    const cz = toChunk(Math.floor(z));
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.generated.has(`${cx + dx},${cz + dz}`)) {
          return false;
        }
      }
    }
    return true;
  }

  private dispatchActionsAtTick(tick: number, sample: ReplayControlSample): void {
    while (this.actionIndex < this.inputs.actions.length && this.inputs.actions[this.actionIndex]!.tick === tick) {
      const action = this.inputs.actions[this.actionIndex]!;
      this.actionIndex += 1;
      this.dispatch(action, sample);
    }
  }

  next(): ReplayControlSample | undefined {
    if (this.finished) {
      return;
    }
    const sample = sampleFromReplayFrame(this.inputs.frames[this.tickIndex]!);
    this.dispatchActionsAtTick(this.tickIndex, sample);
    this.tickIndex += 1;
    if (this.finished) {
      this.dispatchActionsAtTick(this.tickIndex, sample);
    }
    this.preparedColumnChanges = this.prepareColumnChangesForNextTick();
    return sample;
  }
}
