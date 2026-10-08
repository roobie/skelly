import { canonicalJsonBytes } from '../core/canonicalJson.ts';
import { SKIP_COMPRESSION } from '../core/compression.ts';
import { decodeSave, encodeSave, type SaveContentKind, type SaveWorldOptions } from '../core/saveFormat.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import { INPUT_BINDINGS, type InputContext, POINTER_ACTIONS } from './inputBindings.ts';
import type { MoveIntent } from './player.ts';
import { QUICKBAR_SLOTS } from './quickbar.ts';
import { isReplayActionPayload, type ReplayActionPayload } from './replayCommands.ts';
import { PHYSICS_RATE } from './session.ts';

export const INPUT_REPLAY_SCHEMA_VERSION = 16;

export const withReplayExportGuard = <T>(hasOverrides: boolean, exportReplay: () => T): T => {
  if (hasOverrides) {
    throw new Error('Replay export is unavailable while debug firearm-handling overrides differ from content');
  }
  return exportReplay();
};
const INPUT_REPLAY_TICKS_PER_WINDOW = 60 * 60 * 2;
// Keep each render frame's bounded compressed ticks available so rollover cannot cut it in half.
const INPUT_REPLAY_TICKS_PER_FRAME = Math.ceil(SKIP_COMPRESSION.maxSimPerFrame * PHYSICS_RATE);
const INPUT_REPLAY_MAX_TICKS = INPUT_REPLAY_TICKS_PER_WINDOW * 2 + INPUT_REPLAY_TICKS_PER_FRAME;
const INPUT_REPLAY_ACTIONS_PER_WINDOW = 8192;
const INPUT_REPLAY_MAX_ACTIONS = INPUT_REPLAY_ACTIONS_PER_WINDOW * 2;
const INPUT_REPLAY_MAX_COLUMN_CHANGE_EVENTS_PER_WINDOW = 32_768;
const INPUT_REPLAY_MAX_GENERATED_COLUMNS = 4096;
const INPUT_REPLAY_MAX_COLUMN_CHANGE_EVENTS =
  INPUT_REPLAY_MAX_COLUMN_CHANGE_EVENTS_PER_WINDOW * 2 + INPUT_REPLAY_MAX_GENERATED_COLUMNS * 2;
export const INPUT_REPLAY_MAX_BYTES = 5 * 1024 * 1024;
const INPUT_REPLAY_MAX_ACTION_PAYLOAD_BYTES = 256 * 1024;

const MAGIC = 'DEADVOX_REPLAY';
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const PENDING_REPLAY_KEY = 'deadvox.pending-replay';
const REPLAY_PAYLOAD_ACTIONS = new Set<ReplayActionPayload['kind']>([
  'inventory.move',
  'inventory.to-hands',
  'item.pickup',
  'furniture.interact',
  'inventory.search',
  'inventory.work',
  'inventory.assign',
  'inventory.cancel-handling',
  'craft.start',
  'craft.continue',
  'craft.stop',
  'item.throw.cancel',
  'item.throw',
]);
const REPLAY_SEMANTIC_ACTIONS = [
  'item.throw',
  'item.throw.cancel',
  'throw.stance.toggle',
  'item.drop',
  'inventory.move',
  'inventory.to-hands',
  'item.pickup',
  'furniture.interact',
  'inventory.search',
  'inventory.work',
  'inventory.assign',
  'inventory.cancel-handling',
  'craft.start',
  'craft.continue',
  'craft.stop',
  ...Array.from({ length: QUICKBAR_SLOTS }, (_, index) => [
    `quickbar.tap.${index + 1}`,
    `quickbar.hold.${index + 1}`,
  ]).flat(),
] as const;
const ACTION_IDS = [
  ...new Set([
    ...INPUT_BINDINGS.flatMap((binding) => binding.commands.map((command) => command.id)),
    ...POINTER_ACTIONS.map((action) => action.id),
    ...REPLAY_SEMANTIC_ACTIONS,
  ]),
];
const ACTION_INDEX = new Map(ACTION_IDS.map((id, index) => [id, index]));
const CONTEXTS: readonly InputContext[] = [
  'title',
  'menu',
  'inventory',
  'reading',
  'spawn',
  'debug-panel',
  'build',
  'noclip',
  'play',
  'interrupted',
];
const CONTEXT_INDEX = new Map(CONTEXTS.map((context, index) => [context, index]));
const FRAME_FLAGS = {
  active: 1 << 0,
  inputLocked: 1 << 1,
  jump: 1 << 2,
  sprint: 1 << 3,
  walk: 1 << 4,
  useDominant: 1 << 5,
  useDominantHeld: 1 << 6,
  useOff: 1 << 7,
  descending: 1 << 8,
  worldReady: 1 << 9,
} as const;

export interface ReplayControlSample {
  readonly active: boolean;
  readonly inputLocked: boolean;
  readonly intent: MoveIntent;
  readonly yaw: number;
  readonly pitch: number;
  readonly walking: boolean;
  readonly descending: boolean;
  readonly worldReady: boolean;
  readonly compression: number;
}

export interface ReplayAction {
  readonly tick: number;
  readonly action: string;
  readonly phase: 'down' | 'up';
  readonly context: InputContext;
  readonly payload?: ReplayActionPayload;
}

export type ReplayFrame = readonly [
  yaw: number,
  pitch: number,
  forward: number,
  right: number,
  flags: number,
  compression: number,
];

export type ReplayGeneratedColumn = readonly [cx: number, cz: number];
export type ReplayColumnUpdate = readonly [cx: number, cz: number, generated: boolean];
export type ReplayColumnChange = readonly [tick: number, cx: number, cz: number, generated: boolean];

export interface ReplayInputData {
  readonly frames: readonly ReplayFrame[];
  readonly actions: readonly ReplayAction[];
  readonly generatedColumns: readonly ReplayGeneratedColumn[];
  readonly columnChanges: readonly ReplayColumnChange[];
  readonly startState?: ReplayStartState | undefined;
}

export interface ReplayStartState {
  readonly throwingStance: boolean;
  readonly readyHeld: boolean;
  readonly aimingDownSights: boolean;
  readonly inventoryOpen: boolean;
}

export const DEFAULT_REPLAY_START_STATE: ReplayStartState = {
  throwingStance: false,
  readyHeld: false,
  aimingDownSights: false,
  inventoryOpen: false,
};

export const restoreReplayStartState = (state?: ReplayStartState): ReplayStartState =>
  structuredClone(state ?? DEFAULT_REPLAY_START_STATE);

export interface DecodedInputReplay {
  readonly snapshot: Readonly<SaveSnapshot>;
  readonly worldOptions: SaveWorldOptions & { seed: number; clock: { ratio: number; start: number } };
  readonly inputs: ReplayInputData;
  readonly startState: ReplayStartState;
  readonly endStateFingerprint: string;
  readonly endSimTimestamp: number;
}

/** Strict wire shape: old payloads with `endSimTime` are rejected by field validation, with no compatibility alias. */
interface ReplayWire {
  magic: typeof MAGIC;
  schemaVersion: number;
  startSave: string;
  startState: ReplayStartState;
  frames: ReplayFrame[];
  actions: ReplayAction[];
  generatedColumns: ReplayGeneratedColumn[];
  columnChanges: ReplayColumnChange[];
  endStateFingerprint: string;
  endSimTimestamp: number;
}

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const stride = 0x80_00;
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + stride)));
  }
  return btoa(binary);
};

const decodeBase64 = (value: string): Uint8Array => {
  if (value.length > Math.ceil(INPUT_REPLAY_MAX_BYTES / 3) * 4) {
    throw new Error('Replay starting save exceeds the supported size');
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch (error) {
    throw new Error('Replay starting save is not valid base64', { cause: error });
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isValidQueuedAction = (
  action: string,
  context: InputContext,
  payload: ReplayActionPayload | undefined,
): boolean => {
  if (!(ACTION_INDEX.has(action) && CONTEXT_INDEX.has(context))) {
    return false;
  }
  const validPayload = REPLAY_PAYLOAD_ACTIONS.has(action as ReplayActionPayload['kind']) ? payload !== undefined : true;
  return validPayload && (payload === undefined || (isReplayActionPayload(payload) && payload.kind === action));
};

type ReplayActionRecord = Record<string, unknown> & {
  tick: number;
  action: string;
  phase: 'down' | 'up';
  context: InputContext;
};

const hasValidActionPayload = (action: string, candidate: Record<string, unknown>): boolean => {
  const hasPayload = Object.hasOwn(candidate, 'payload');
  if (REPLAY_PAYLOAD_ACTIONS.has(action as ReplayActionPayload['kind']) && !hasPayload) {
    return false;
  }
  return !hasPayload || (isReplayActionPayload(candidate.payload) && candidate.payload.kind === action);
};

const isReplayGeneratedColumn = (candidate: unknown): candidate is ReplayGeneratedColumn =>
  Array.isArray(candidate) &&
  candidate.length === 2 &&
  Number.isSafeInteger(candidate[0]) &&
  Number.isSafeInteger(candidate[1]);

const isReplayColumnChange = (
  candidate: unknown,
  lastTick: number,
  frameCount: number,
): candidate is ReplayColumnChange =>
  Array.isArray(candidate) &&
  candidate.length === 4 &&
  Number.isSafeInteger(candidate[0]) &&
  candidate[0] >= lastTick &&
  candidate[0] < frameCount &&
  Number.isSafeInteger(candidate[1]) &&
  Number.isSafeInteger(candidate[2]) &&
  typeof candidate[3] === 'boolean';

const isReplayActionRecord = (
  candidate: unknown,
  lastTick: number,
  frameCount: number,
): candidate is ReplayActionRecord => {
  if (!(isRecord(candidate) && Number.isSafeInteger(candidate.tick) && typeof candidate.action === 'string')) {
    return false;
  }
  const tick = candidate.tick as number;
  const { action } = candidate;
  return (
    tick >= 0 &&
    tick <= frameCount &&
    tick >= lastTick &&
    ACTION_INDEX.has(action) &&
    (candidate.phase === 'down' || candidate.phase === 'up') &&
    typeof candidate.context === 'string' &&
    CONTEXT_INDEX.has(candidate.context as InputContext) &&
    !Object.hasOwn(candidate, 'value') &&
    hasValidActionPayload(action, candidate)
  );
};

const flagOf = (sample: Omit<ReplayControlSample, 'compression'>): number =>
  (sample.active ? FRAME_FLAGS.active : 0) |
  (sample.inputLocked ? FRAME_FLAGS.inputLocked : 0) |
  (sample.intent.jump ? FRAME_FLAGS.jump : 0) |
  (sample.intent.sprint ? FRAME_FLAGS.sprint : 0) |
  (sample.intent.walk ? FRAME_FLAGS.walk : 0) |
  (sample.intent.useDominant ? FRAME_FLAGS.useDominant : 0) |
  (sample.intent.useDominantHeld ? FRAME_FLAGS.useDominantHeld : 0) |
  (sample.intent.useOff ? FRAME_FLAGS.useOff : 0) |
  (sample.descending ? FRAME_FLAGS.descending : 0) |
  (sample.worldReady ? FRAME_FLAGS.worldReady : 0);

export const sampleFromReplayFrame = (frame: ReplayFrame): ReplayControlSample => {
  const [yaw, pitch, forward, right, flags] = frame;
  return {
    active: Boolean(flags & FRAME_FLAGS.active),
    inputLocked: Boolean(flags & FRAME_FLAGS.inputLocked),
    intent: {
      forward,
      right,
      jump: Boolean(flags & FRAME_FLAGS.jump),
      sprint: Boolean(flags & FRAME_FLAGS.sprint),
      walk: Boolean(flags & FRAME_FLAGS.walk),
      useDominant: Boolean(flags & FRAME_FLAGS.useDominant),
      useDominantHeld: Boolean(flags & FRAME_FLAGS.useDominantHeld),
      useOff: Boolean(flags & FRAME_FLAGS.useOff),
    },
    yaw,
    pitch,
    walking: Boolean(flags & FRAME_FLAGS.walk),
    descending: Boolean(flags & FRAME_FLAGS.descending),
    worldReady: Boolean(flags & FRAME_FLAGS.worldReady),
    compression: frame[5],
  };
};

const appendColumnChanges = (
  changes: ReplayColumnChange[],
  tick: number,
  updates: readonly ReplayColumnUpdate[],
  eventLimit: number,
): boolean => {
  if (changes.length + updates.length > eventLimit) {
    return false;
  }
  for (const [cx, cz, generated] of updates) {
    if (!(Number.isSafeInteger(cx) && Number.isSafeInteger(cz)) || typeof generated !== 'boolean') {
      throw new Error('Invalid input replay column change');
    }
    changes.push([tick, cx, cz, generated]);
  }
  return true;
};

export class InputReplayRecorder {
  private readonly yawPitch: Float64Array;
  private readonly compression: Float64Array;
  private readonly movement: Int8Array;
  private readonly flags: Uint16Array;
  private readonly bufferTicks: number;
  readonly ticksPerWindow: number;
  readonly columnChangeEventLimit: number;
  private readonly actionTicks = new Uint16Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private readonly actionIds = new Uint16Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private readonly actionPhases = new Uint8Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private readonly actionContexts = new Uint8Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private readonly actionPayloads: (string | undefined)[] = new Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private pending: {
    action: string;
    phase: 'down' | 'up';
    context: InputContext;
    inSnapshot: boolean;
    payload?: string;
  }[] = [];
  private actionPayloadBytes = 0;
  private frameCount = 0;
  private actionCount = 0;
  private batchStartedAtRealMilliseconds = 0;
  private readonly batchCosts: Float32Array = new Float32Array(120);
  private completedBatches = 0;
  private readonly columnChanges: ReplayColumnChange[] = [];
  private readonly pendingColumnChanges: ReplayColumnUpdate[] = [];
  readonly startSnapshot: Readonly<SaveSnapshot>;
  readonly startState: ReplayStartState;
  readonly generatedColumns: readonly ReplayGeneratedColumn[];

  constructor(
    startSnapshot: Readonly<SaveSnapshot>,
    ticksPerWindow = INPUT_REPLAY_TICKS_PER_WINDOW,
    generatedColumns: readonly ReplayGeneratedColumn[] = [],
    options: { readonly columnChangeEventLimit?: number; readonly startState?: ReplayStartState } = {},
  ) {
    this.ticksPerWindow = ticksPerWindow;
    const columnChangeEventLimit = options.columnChangeEventLimit ?? INPUT_REPLAY_MAX_COLUMN_CHANGE_EVENTS_PER_WINDOW;
    const startState = options.startState ?? DEFAULT_REPLAY_START_STATE;
    if (
      !Number.isSafeInteger(columnChangeEventLimit) ||
      columnChangeEventLimit < 1 ||
      columnChangeEventLimit > INPUT_REPLAY_MAX_COLUMN_CHANGE_EVENTS_PER_WINDOW
    ) {
      throw new Error('Invalid input replay column-change window limit');
    }
    this.columnChangeEventLimit = columnChangeEventLimit;
    if (!Number.isSafeInteger(ticksPerWindow) || ticksPerWindow < 1 || ticksPerWindow > INPUT_REPLAY_TICKS_PER_WINDOW) {
      throw new Error('Invalid input replay window size');
    }
    this.bufferTicks = ticksPerWindow + INPUT_REPLAY_TICKS_PER_FRAME;
    this.yawPitch = new Float64Array(this.bufferTicks * 2);
    this.compression = new Float64Array(this.bufferTicks);
    this.movement = new Int8Array(this.bufferTicks * 2);
    this.flags = new Uint16Array(this.bufferTicks);
    if (generatedColumns.length > INPUT_REPLAY_MAX_GENERATED_COLUMNS) {
      throw new Error('Input replay has too many initially generated columns');
    }
    const seenGeneratedColumns = new Set<string>();
    this.generatedColumns = generatedColumns
      .map(([cx, cz]) => {
        if (!(Number.isSafeInteger(cx) && Number.isSafeInteger(cz))) {
          throw new Error('Input replay generated-column coordinates must be safe integers');
        }
        const key = `${cx},${cz}`;
        if (seenGeneratedColumns.has(key)) {
          throw new Error(`Input replay repeats an initially generated column ${key}`);
        }
        seenGeneratedColumns.add(key);
        return [cx, cz] as const;
      })
      .sort(([ax, az], [bx, bz]) => ax - bx || az - bz);
    this.startSnapshot = structuredClone(startSnapshot);
    this.startState = structuredClone(startState);
  }

  get tickCount(): number {
    return this.frameCount;
  }

  get full(): boolean {
    return (
      this.frameCount >= this.ticksPerWindow ||
      this.actionCount + this.pending.length >= INPUT_REPLAY_ACTIONS_PER_WINDOW ||
      this.columnChanges.length >= this.columnChangeEventLimit
    );
  }

  get columnChangesWouldOverflow(): boolean {
    return this.columnChanges.length + this.pendingColumnChanges.length > this.columnChangeEventLimit;
  }

  get pendingColumnChangesExceedWindow(): boolean {
    return this.pendingColumnChanges.length > this.columnChangeEventLimit;
  }

  get retainedBufferBytes(): number {
    return (
      this.yawPitch.byteLength +
      this.compression.byteLength +
      this.movement.byteLength +
      this.flags.byteLength +
      this.actionTicks.byteLength +
      this.actionIds.byteLength +
      this.actionPhases.byteLength +
      this.actionContexts.byteLength +
      this.actionPayloadBytes * 2 +
      this.generatedColumns.length * 16 +
      this.columnChanges.length * 32 +
      this.batchCosts.byteLength
    );
  }

  queueAction(
    action: string,
    phase: 'down' | 'up',
    context: InputContext,
    options: { payload?: ReplayActionPayload; inSnapshot?: boolean } = {},
  ): void {
    if (
      this.frameCount >= this.bufferTicks ||
      this.actionCount + this.pending.length >= INPUT_REPLAY_ACTIONS_PER_WINDOW
    ) {
      return;
    }
    if (!isValidQueuedAction(action, context, options.payload)) {
      throw new Error(`Input replay cannot encode ${action} in ${context}`);
    }
    const payloadText =
      options.payload === undefined ? undefined : new TextDecoder().decode(canonicalJsonBytes(options.payload));
    const payloadBytes = payloadText === undefined ? 0 : new TextEncoder().encode(payloadText).byteLength;
    if (payloadBytes + this.actionPayloadBytes > INPUT_REPLAY_MAX_ACTION_PAYLOAD_BYTES) {
      throw new Error('Input replay action payloads exceed the supported size');
    }
    this.actionPayloadBytes += payloadBytes;
    this.pending.push({
      action,
      phase,
      context,
      inSnapshot: options.inSnapshot ?? false,
      ...(payloadText === undefined ? {} : { payload: payloadText }),
    });
  }

  transferPendingColumnChangesTo(next: InputReplayRecorder): void {
    if (
      next.columnChanges.length + next.pendingColumnChanges.length + this.pendingColumnChanges.length >
      next.columnChangeEventLimit
    ) {
      throw new Error('Input replay column changes exceed the recording window');
    }
    next.pendingColumnChanges.push(...this.pendingColumnChanges);
    this.pendingColumnChanges.length = 0;
  }

  resolvePendingActionsAtRollover(next: InputReplayRecorder): void {
    let transferredPayloadBytes = 0;
    for (const pending of this.pending) {
      if (pending.inSnapshot) {
        const index = this.actionCount;
        this.actionCount += 1;
        this.actionTicks[index] = this.frameCount;
        this.actionIds[index] = ACTION_INDEX.get(pending.action)!;
        this.actionPhases[index] = pending.phase === 'down' ? 0 : 1;
        this.actionContexts[index] = CONTEXT_INDEX.get(pending.context)!;
        if (pending.payload !== undefined) {
          this.actionPayloads[index] = pending.payload;
        }
        continue;
      }
      const payload = pending.payload === undefined ? undefined : (JSON.parse(pending.payload) as ReplayActionPayload);
      next.queueAction(pending.action, pending.phase, pending.context, {
        ...(payload === undefined ? {} : { payload }),
        inSnapshot: pending.inSnapshot,
      });
      if (pending.payload !== undefined) {
        transferredPayloadBytes += new TextEncoder().encode(pending.payload).byteLength;
      }
    }
    this.actionPayloadBytes -= transferredPayloadBytes;
    this.pending = [];
  }

  queueColumnChange(cx: number, cz: number, generated: boolean): void {
    this.pendingColumnChanges.push([cx, cz, generated]);
  }

  recordTick(sample: Omit<ReplayControlSample, 'compression'>, compression = 1): boolean {
    if (this.frameCount >= this.bufferTicks) {
      throw new Error('Input replay tick buffer is full');
    }
    if (
      !appendColumnChanges(this.columnChanges, this.frameCount, this.pendingColumnChanges, this.columnChangeEventLimit)
    ) {
      return false;
    }
    this.pendingColumnChanges.length = 0;
    if (this.frameCount % 60 === 0) {
      this.batchStartedAtRealMilliseconds = performance.now();
    }
    for (const pending of this.pending) {
      const index = this.actionCount;
      this.actionCount += 1;
      this.actionTicks[index] = this.frameCount;
      this.actionIds[index] = ACTION_INDEX.get(pending.action)!;
      this.actionPhases[index] = pending.phase === 'down' ? 0 : 1;
      this.actionContexts[index] = CONTEXT_INDEX.get(pending.context)!;
      if (pending.payload !== undefined) {
        this.actionPayloads[index] = pending.payload;
      }
    }
    this.pending = [];
    const frame = this.frameCount;
    this.frameCount += 1;
    this.yawPitch[frame * 2] = sample.yaw;
    this.yawPitch[frame * 2 + 1] = sample.pitch;
    this.compression[frame] = compression;
    this.movement[frame * 2] = sample.intent.forward;
    this.movement[frame * 2 + 1] = sample.intent.right;
    this.flags[frame] = flagOf(sample);
    if (this.frameCount % 60 === 0 && this.completedBatches < this.batchCosts.length) {
      this.batchCosts[this.completedBatches] = (performance.now() - this.batchStartedAtRealMilliseconds) / 60;
      this.completedBatches += 1;
    }
    return true;
  }

  copyInputs(): ReplayInputData {
    const frames: ReplayFrame[] = Array.from({ length: this.frameCount }, (_, tick) => [
      this.yawPitch[tick * 2]!,
      this.yawPitch[tick * 2 + 1]!,
      this.movement[tick * 2]!,
      this.movement[tick * 2 + 1]!,
      this.flags[tick]!,
      this.compression[tick]!,
    ]);
    const actions: ReplayAction[] = Array.from({ length: this.actionCount }, (_, index) => ({
      tick: this.actionTicks[index]!,
      action: ACTION_IDS[this.actionIds[index]!]!,
      phase: this.actionPhases[index] === 0 ? 'down' : 'up',
      context: CONTEXTS[this.actionContexts[index]!]!,
      ...(this.actionPayloads[index] === undefined
        ? {}
        : { payload: JSON.parse(this.actionPayloads[index]!) as ReplayActionPayload }),
    }));
    return {
      frames,
      actions,
      generatedColumns: this.generatedColumns.map(([cx, cz]) => [cx, cz]),
      columnChanges: this.columnChanges.map(([tick, cx, cz, generated]) => [tick, cx, cz, generated]),
      startState: this.startState,
    };
  }

  timing(): { readonly samples: number; readonly meanMs: number; readonly p95Ms: number; readonly maxMs: number } {
    const costs = [...this.batchCosts.subarray(0, this.completedBatches)].sort((a, b) => a - b);
    if (costs.length === 0) {
      return { samples: 0, meanMs: 0, p95Ms: 0, maxMs: 0 };
    }
    const total = costs.reduce((sum, cost) => sum + cost, 0);
    return {
      samples: this.frameCount,
      meanMs: total / costs.length,
      p95Ms: costs[Math.min(costs.length - 1, Math.ceil(costs.length * 0.95) - 1)]!,
      maxMs: costs.at(-1)!,
    };
  }
}

export const rolloverInputReplayRecorder = (
  current: InputReplayRecorder,
  startSnapshot: Readonly<SaveSnapshot>,
  generatedColumns: readonly ReplayGeneratedColumn[] = current.generatedColumns,
  startState: ReplayStartState = DEFAULT_REPLAY_START_STATE,
): InputReplayRecorder => {
  const next = new InputReplayRecorder(startSnapshot, current.ticksPerWindow, generatedColumns, {
    columnChangeEventLimit: current.columnChangeEventLimit,
    startState,
  });
  current.resolvePendingActionsAtRollover(next);
  current.transferPendingColumnChangesTo(next);
  return next;
};

const applyColumnChanges = (generated: Set<string>, changes: readonly ReplayColumnChange[]): void => {
  for (const [, cx, cz, isGenerated] of changes) {
    const key = `${cx},${cz}`;
    if (isGenerated) {
      generated.add(key);
    } else {
      generated.delete(key);
    }
  }
};

const columnSeamChanges = (
  previous: ReplayInputData,
  current: ReplayInputData,
  offset: number,
): ReplayColumnChange[] => {
  const generated = new Set(previous.generatedColumns.map(([cx, cz]) => `${cx},${cz}`));
  applyColumnChanges(generated, previous.columnChanges);
  const nextGenerated = new Set(current.generatedColumns.map(([cx, cz]) => `${cx},${cz}`));
  const explicitSeamChanges = new Set(
    current.columnChanges.filter(([tick]) => tick === 0).map(([, cx, cz]) => `${cx},${cz}`),
  );
  const seamChanges: ReplayColumnChange[] = [];
  for (const key of [...generated].sort()) {
    if (!(nextGenerated.has(key) || explicitSeamChanges.has(key))) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      seamChanges.push([offset, cx, cz, false]);
    }
  }
  for (const key of [...nextGenerated].sort()) {
    if (!(generated.has(key) || explicitSeamChanges.has(key))) {
      const [cx, cz] = key.split(',').map(Number) as [number, number];
      seamChanges.push([offset, cx, cz, true]);
    }
  }
  return seamChanges;
};

export function joinInputReplayWindows(
  previous: ReplayInputData | undefined,
  current: ReplayInputData,
): ReplayInputData {
  if (!previous) {
    return current;
  }
  const offset = previous.frames.length;
  const frames = [...previous.frames, ...current.frames];
  const actions = [
    ...previous.actions,
    ...current.actions.map((action) => ({ ...action, tick: action.tick + offset })),
  ];
  const seamChanges = columnSeamChanges(previous, current, offset);
  const columnChanges = [
    ...previous.columnChanges,
    ...seamChanges,
    ...current.columnChanges.map(([tick, cx, cz, isGenerated]) => [tick + offset, cx, cz, isGenerated] as const),
  ];
  if (
    frames.length > INPUT_REPLAY_MAX_TICKS ||
    actions.length > INPUT_REPLAY_MAX_ACTIONS ||
    columnChanges.length > INPUT_REPLAY_MAX_COLUMN_CHANGE_EVENTS
  ) {
    throw new Error('Combined replay windows exceed the supported recording bounds');
  }
  return {
    frames,
    actions,
    generatedColumns: previous.generatedColumns,
    columnChanges,
    startState: previous.startState ?? current.startState,
  };
}

export function stashInputReplay(bytes: Uint8Array): void {
  if (bytes.byteLength > INPUT_REPLAY_MAX_BYTES) {
    throw new Error('Replay file exceeds the supported size');
  }
  try {
    sessionStorage.setItem(PENDING_REPLAY_KEY, encodeBase64(bytes));
  } catch (error) {
    throw new Error('Replay could not be staged for playback in this browser session', { cause: error });
  }
}

export function pendingInputReplay(): Uint8Array | undefined {
  let encoded: string | null;
  try {
    encoded = sessionStorage.getItem(PENDING_REPLAY_KEY);
  } catch {
    return;
  }
  return encoded === null ? undefined : decodeBase64(encoded);
}

export function clearPendingInputReplay(): void {
  try {
    sessionStorage.removeItem(PENDING_REPLAY_KEY);
  } catch {
    /* A failed cleanup must not alter the imported artifact. */
  }
}

export async function replayStateFingerprint(snapshot: Readonly<SaveSnapshot>): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Replay state verification requires Web Crypto');
  }
  const normalize = (value: unknown): unknown => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number(value.toFixed(9));
    }
    if (Array.isArray(value)) {
      return value.map((entry) => normalize(entry));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, normalize(entry)]));
    }
    return value;
  };
  const canonical = canonicalJsonBytes(normalize(snapshot));
  const buffer = new ArrayBuffer(canonical.byteLength);
  new Uint8Array(buffer).set(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function encodeInputReplay(
  snapshot: Readonly<SaveSnapshot>,
  inputs: ReplayInputData,
  worldOptions: SaveWorldOptions,
  endSnapshot: Readonly<SaveSnapshot>,
): Promise<Uint8Array> {
  if (inputs.frames.length === 0 || inputs.frames.length > INPUT_REPLAY_MAX_TICKS) {
    throw new Error('Replay has no input ticks or exceeds its rolling window');
  }
  const startSave = await encodeSave(snapshot, { generation: 1, worldOptions });
  const wire: ReplayWire = {
    magic: MAGIC,
    schemaVersion: INPUT_REPLAY_SCHEMA_VERSION,
    startSave: encodeBase64(startSave),
    startState: inputs.startState ?? DEFAULT_REPLAY_START_STATE,
    frames: inputs.frames.map((frame) => [...frame] as ReplayFrame),
    actions: inputs.actions.map((action) => ({ ...action })),
    generatedColumns: inputs.generatedColumns.map(([cx, cz]) => [cx, cz]),
    columnChanges: inputs.columnChanges.map(([tick, cx, cz, generated]) => [tick, cx, cz, generated]),
    endStateFingerprint: await replayStateFingerprint(endSnapshot),
    endSimTimestamp: endSnapshot.character.simulation.time,
  };
  const bytes = canonicalJsonBytes(wire);
  if (bytes.byteLength > INPUT_REPLAY_MAX_BYTES) {
    throw new Error(`Replay file exceeds issue-attachment size (${bytes.byteLength} bytes)`);
  }
  return bytes;
}

export async function decodeInputReplay(
  input: Uint8Array | ArrayBuffer,
  options: { readonly contentLookup: (kind: SaveContentKind, id: string) => boolean },
): Promise<DecodedInputReplay> {
  const bytes = input instanceof Uint8Array ? input.slice() : new Uint8Array(input.slice(0));
  if (bytes.byteLength > INPUT_REPLAY_MAX_BYTES) {
    throw new Error('Replay file exceeds the supported size');
  }
  let text: string;
  let value: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('Replay is not valid UTF-8 JSON', { cause: error });
  }
  if (!isRecord(value) || value.magic !== MAGIC || value.schemaVersion !== INPUT_REPLAY_SCHEMA_VERSION) {
    throw new Error('Unsupported replay format');
  }
  if (
    typeof value.startSave !== 'string' ||
    !isRecord(value.startState) ||
    typeof value.startState.throwingStance !== 'boolean' ||
    typeof value.startState.readyHeld !== 'boolean' ||
    typeof value.startState.aimingDownSights !== 'boolean' ||
    typeof value.startState.inventoryOpen !== 'boolean' ||
    Object.keys(value.startState).length !== 4 ||
    !Array.isArray(value.frames) ||
    !Array.isArray(value.actions) ||
    !Array.isArray(value.generatedColumns) ||
    !Array.isArray(value.columnChanges) ||
    typeof value.endStateFingerprint !== 'string' ||
    !FINGERPRINT_PATTERN.test(value.endStateFingerprint) ||
    typeof value.endSimTimestamp !== 'number' ||
    !Number.isFinite(value.endSimTimestamp) ||
    value.endSimTimestamp < 0
  ) {
    throw new Error('Replay is missing its starting save or input sequence');
  }
  if (value.frames.length === 0 || value.frames.length > INPUT_REPLAY_MAX_TICKS) {
    throw new Error('Replay input sequence is empty or exceeds the rolling window');
  }
  if (value.actions.length > INPUT_REPLAY_MAX_ACTIONS) {
    throw new Error('Replay input sequence has too many actions');
  }
  if (
    value.generatedColumns.length > INPUT_REPLAY_MAX_GENERATED_COLUMNS ||
    value.columnChanges.length > INPUT_REPLAY_MAX_COLUMN_CHANGE_EVENTS
  ) {
    throw new Error('Replay input sequence has too many generated-column entries');
  }
  if (new TextDecoder().decode(canonicalJsonBytes(value)) !== text) {
    throw new Error('Replay encoding is not canonical');
  }
  const frames: ReplayFrame[] = value.frames.map((candidate, tick) => {
    if (
      !Array.isArray(candidate) ||
      candidate.length !== 6 ||
      candidate.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry)) ||
      !Number.isInteger(candidate[2]) ||
      !Number.isInteger(candidate[3]) ||
      Math.abs(candidate[2]) > 1 ||
      Math.abs(candidate[3]) > 1 ||
      !Number.isSafeInteger(candidate[4]) ||
      candidate[4] < 0 ||
      candidate[4] > 0x3_ff ||
      candidate[5] < 1 ||
      candidate[5] > 1_000_000
    ) {
      throw new Error(`Invalid replay input frame ${tick}`);
    }
    return [
      candidate[0] as number,
      candidate[1] as number,
      candidate[2] as number,
      candidate[3] as number,
      candidate[4] as number,
      candidate[5] as number,
    ];
  });
  const generatedColumns: ReplayGeneratedColumn[] = value.generatedColumns.map((candidate, index) => {
    if (!isReplayGeneratedColumn(candidate)) {
      throw new Error(`Invalid replay generated column ${index}`);
    }
    return [candidate[0], candidate[1]];
  });
  const generatedColumnKeys = new Set(generatedColumns.map(([cx, cz]) => `${cx},${cz}`));
  if (generatedColumnKeys.size !== generatedColumns.length) {
    throw new Error('Replay repeats an initially generated column');
  }
  let lastColumnTick = -1;
  const columnChanges: ReplayColumnChange[] = value.columnChanges.map((candidate, index) => {
    if (!isReplayColumnChange(candidate, lastColumnTick, frames.length)) {
      throw new Error(`Invalid or out-of-order replay column change ${index}`);
    }
    const [tick, cx, cz, generated] = candidate;
    lastColumnTick = tick;
    return [tick, cx, cz, generated];
  });
  let lastTick = -1;
  let actionPayloadBytes = 0;
  const actions: ReplayAction[] = value.actions.map((candidate, index) => {
    if (!isReplayActionRecord(candidate, lastTick, frames.length)) {
      throw new Error(`Invalid or out-of-order replay action ${index}`);
    }
    if (Object.hasOwn(candidate, 'payload')) {
      actionPayloadBytes += canonicalJsonBytes(candidate.payload).byteLength;
      if (actionPayloadBytes > INPUT_REPLAY_MAX_ACTION_PAYLOAD_BYTES) {
        throw new Error('Replay action payloads exceed the supported size');
      }
    }
    lastTick = candidate.tick;
    return {
      tick: candidate.tick,
      action: candidate.action,
      phase: candidate.phase,
      context: candidate.context,
      ...(Object.hasOwn(candidate, 'payload') ? { payload: candidate.payload as ReplayActionPayload } : {}),
    };
  });
  const saveBytes = decodeBase64(value.startSave);
  const decoded = await decodeSave(saveBytes, { contentLookup: options.contentLookup });
  return {
    snapshot: decoded.snapshot,
    worldOptions: decoded.worldOptions,
    inputs: { frames, actions, generatedColumns, columnChanges },
    startState: {
      throwingStance: value.startState.throwingStance,
      readyHeld: value.startState.readyHeld,
      aimingDownSights: value.startState.aimingDownSights,
      inventoryOpen: value.startState.inventoryOpen,
    },
    endStateFingerprint: value.endStateFingerprint,
    endSimTimestamp: value.endSimTimestamp,
  };
}
