import type { KeyTraceEntry } from '../game/inputBindings.ts';

const KEY_TRACE_LIMIT = 2048;

export class KeyTrace {
  private entries: (KeyTraceEntry & { sequence: number })[] = [];
  private sequence = 0;
  readonly record = (entry: KeyTraceEntry): void => {
    this.entries.push({ ...entry, sequence: this.sequence });
    this.sequence += 1;
    if (this.entries.length > KEY_TRACE_LIMIT) {
      this.entries.shift();
    }
  };
  clear(): void {
    this.entries = [];
    this.sequence = 0;
  }
  export(): string {
    return JSON.stringify({ entries: this.entries }, null, 2);
  }
}
