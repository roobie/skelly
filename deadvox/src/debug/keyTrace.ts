import type { InputContext } from '../game/inputBindings.ts';

export interface KeyTraceEntry {
  readonly kind: 'down' | 'up' | 'context' | 'cancel' | 'focus' | 'blur' | 'visibility' | 'pointer-lock';
  readonly at: number;
  readonly context: InputContext;
  readonly focus: 'editable' | 'other';
  readonly hidden: boolean;
  readonly pointerLocked: boolean;
  readonly down: readonly string[];
  readonly blocked: readonly string[];
  readonly active: readonly { code: string; action: string }[];
  readonly reason?: string;
  readonly code?: string;
  readonly repeat?: boolean;
  readonly shiftKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  readonly isComposing?: boolean;
  readonly isTrusted?: boolean;
  readonly accepted?: boolean;
}

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
