import { canonicalJsonBytes } from '../core/canonicalJson.ts';
import { decodeSave, encodeSave, type SaveContentKind, type SaveWorldOptions } from '../core/saveFormat.ts';
import type { SaveSnapshot } from '../core/saveState.ts';
import { INPUT_BINDINGS, type InputContext, POINTER_ACTIONS } from './inputBindings.ts';
import { QUICKBAR_SLOTS } from './quickbar.ts';
import type { MoveIntent } from './player.ts';

const INPUT_REPLAY_SCHEMA_VERSION = 2;
const INPUT_REPLAY_TICKS_PER_WINDOW = 60 * 60 * 2;
const INPUT_REPLAY_MAX_TICKS = INPUT_REPLAY_TICKS_PER_WINDOW * 2;
const INPUT_REPLAY_ACTIONS_PER_WINDOW = 8192;
const INPUT_REPLAY_MAX_ACTIONS = INPUT_REPLAY_ACTIONS_PER_WINDOW * 2;
export const INPUT_REPLAY_MAX_BYTES = 5 * 1024 * 1024;

const MAGIC = 'DEADVOX_REPLAY';
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;/
const PENDING_REPLAY_KEY = 'deadvox.pending-replay';
const REPLAY_SEMANTIC_ACTIONS = [
  'glowstick.throw',
  'glowstick.cancel',
  ...Array.from({ length: QUICKBAR_SLOTS }, (_, index) => [`quickbar.tap.${index + 1}`, `quickbar.hold.${index + 1}`]).flat(),
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
} as const;

export interface ReplayControlSample {
  readonly active: boolean;
  readonly inputLocked: boolean;
  readonly intent: MoveIntent;
  readonly yaw: number;
  readonly pitch: number;
  readonly walking: boolean;
  readonly descending: boolean;
  readonly compression: number;
}

export interface ReplayAction {
  readonly tick: number;
  readonly action: string;
  readonly phase: 'down' | 'up';
  readonly context: InputContext;
  readonly value?: number;
}

export type ReplayFrame = readonly [
  yaw: number,
  pitch: number,
  forward: number,
  right: number,
  flags: number,
  compression: number,
];

export interface ReplayInputData {
  readonly frames: readonly ReplayFrame[];
  readonly actions: readonly ReplayAction[];
}

export interface DecodedInputReplay {
  readonly snapshot: Readonly<SaveSnapshot>;
  readonly worldOptions: SaveWorldOptions & { seed: number; clock: { ratio: number; start: number } };
  readonly inputs: ReplayInputData;
  readonly endStateFingerprint: string;
}

interface ReplayWire {
  magic: typeof MAGIC;
  schemaVersion: number;
  startSave: string;
  frames: ReplayFrame[];
  actions: ReplayAction[];
  endStateFingerprint: string;
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

const flagOf = (sample: Omit<ReplayControlSample, 'compression'>): number =>
  (sample.active ? FRAME_FLAGS.active : 0) |
  (sample.inputLocked ? FRAME_FLAGS.inputLocked : 0) |
  (sample.intent.jump ? FRAME_FLAGS.jump : 0) |
  (sample.intent.sprint ? FRAME_FLAGS.sprint : 0) |
  (sample.intent.walk ? FRAME_FLAGS.walk : 0) |
  (sample.intent.useDominant ? FRAME_FLAGS.useDominant : 0) |
  (sample.intent.useDominantHeld ? FRAME_FLAGS.useDominantHeld : 0) |
  (sample.intent.useOff ? FRAME_FLAGS.useOff : 0) |
  (sample.descending ? FRAME_FLAGS.descending : 0);

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
    compression: frame[5],
  };
};

export class InputReplayRecorder {
  private readonly yawPitch = new Float64Array(INPUT_REPLAY_TICKS_PER_WINDOW * 2);
  private readonly compression = new Float64Array(INPUT_REPLAY_TICKS_PER_WINDOW);
  private readonly movement = new Int8Array(INPUT_REPLAY_TICKS_PER_WINDOW * 2);
  private readonly flags = new Uint16Array(INPUT_REPLAY_TICKS_PER_WINDOW);
  private readonly actionTicks = new Uint16Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private readonly actionIds = new Uint16Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private readonly actionPhases = new Uint8Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private readonly actionContexts = new Uint8Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private readonly actionValues = new Float64Array(INPUT_REPLAY_ACTIONS_PER_WINDOW);
  private pending: { action: string; phase: 'down' | 'up'; context: InputContext; value?: number }[] = [];
  private frameCount = 0;
  private actionCount = 0;
  private batchStartedAt = 0;
  private readonly batchCosts: Float32Array = new Float32Array(120);
  private completedBatches = 0;
  readonly startSnapshot: Readonly<SaveSnapshot>;

  constructor(startSnapshot: Readonly<SaveSnapshot>) {
    this.startSnapshot = structuredClone(startSnapshot);
  }

  get tickCount(): number {
    return this.frameCount;
  }

  get full(): boolean {
    return (
      this.frameCount >= INPUT_REPLAY_TICKS_PER_WINDOW ||
      this.actionCount + this.pending.length >= INPUT_REPLAY_ACTIONS_PER_WINDOW
    );
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
      this.actionValues.byteLength +
      this.batchCosts.byteLength
    );
  }

  queueAction(action: string, phase: 'down' | 'up', context: InputContext, value?: number): void {
    if (this.full) {
      return;
    }
    if (
      !(ACTION_INDEX.has(action) && CONTEXT_INDEX.has(context)) ||
      (action === 'glowstick.throw'
        ? typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10_000
        : value !== undefined)
    ) {
      throw new Error(`Input replay cannot encode ${action} in ${context}`);
    }
    this.pending.push({ action, phase, context, ...(value === undefined ? {} : { value }) });
  }

  recordTick(sample: Omit<ReplayControlSample, 'compression'>, compression = 1): void {
    if (this.frameCount >= INPUT_REPLAY_TICKS_PER_WINDOW) {
      return;
    }
    if (this.frameCount % 60 === 0) {
      this.batchStartedAt = performance.now();
    }
    for (const pending of this.pending) {
      const index = this.actionCount;
      this.actionCount += 1;
      this.actionTicks[index] = this.frameCount;
      this.actionIds[index] = ACTION_INDEX.get(pending.action)!;
      this.actionPhases[index] = pending.phase === 'down' ? 0 : 1;
      this.actionContexts[index] = CONTEXT_INDEX.get(pending.context)!;
      if (pending.value !== undefined) {
        this.actionValues[index] = pending.value;
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
      this.batchCosts[this.completedBatches] = (performance.now() - this.batchStartedAt) / 60;
      this.completedBatches += 1;
    }
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
      ...(ACTION_IDS[this.actionIds[index]!] === 'glowstick.throw'
        ? { value: this.actionValues[index]! }
        : {}),
    }));
    return { frames, actions };
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
  if (frames.length > INPUT_REPLAY_MAX_TICKS || actions.length > INPUT_REPLAY_MAX_ACTIONS) {
    throw new Error('Combined replay windows exceed the supported recording bounds');
  }
  return { frames, actions };
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
  // Live frame accumulation and fixed-step replay can differ below simulation precision.
  const normalize = (value: unknown): unknown => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number(value.toFixed(9));
    }
    if (Array.isArray(value)) {
      return value.map(normalize);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalize(entry)]));
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
    frames: inputs.frames.map((frame) => [...frame] as ReplayFrame),
    actions: inputs.actions.map((action) => ({ ...action })),
    endStateFingerprint: await replayStateFingerprint(endSnapshot),
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
    !Array.isArray(value.frames) ||
    !Array.isArray(value.actions) ||
    typeof value.endStateFingerprint !== 'string' ||
    !FINGERPRINT_PATTERN.test(value.endStateFingerprint)
  ) {
    throw new Error('Replay is missing its starting save or input sequence');
  }
  if (value.frames.length === 0 || value.frames.length > INPUT_REPLAY_MAX_TICKS) {
    throw new Error('Replay input sequence is empty or exceeds the rolling window');
  }
  if (value.actions.length > INPUT_REPLAY_MAX_ACTIONS) {
    throw new Error('Replay input sequence has too many actions');
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
      candidate[4] > 0x1_ff ||
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
  let lastTick = -1;
  const actions: ReplayAction[] = value.actions.map((candidate, index) => {
    if (
      !(isRecord(candidate) && Number.isSafeInteger(candidate.tick)) ||
      (candidate.tick as number) < 0 ||
      (candidate.tick as number) >= frames.length ||
      (candidate.tick as number) < lastTick ||
      typeof candidate.action !== 'string' ||
      !ACTION_INDEX.has(candidate.action) ||
      (candidate.action === 'glowstick.throw'
        ? typeof candidate.value !== 'number' ||
          !Number.isFinite(candidate.value) ||
          candidate.value < 0 ||
          candidate.value > 10_000
        : Object.hasOwn(candidate, 'value')) ||
      (candidate.phase !== 'down' && candidate.phase !== 'up') ||
      typeof candidate.context !== 'string' ||
      !CONTEXT_INDEX.has(candidate.context as InputContext)
    ) {
      throw new Error(`Invalid or out-of-order replay action ${index}`);
    }
    lastTick = candidate.tick as number;
    return {
      tick: candidate.tick as number,
      action: candidate.action,
      phase: candidate.phase,
      context: candidate.context as InputContext,
      ...(candidate.action === 'glowstick.throw' ? { value: candidate.value as number } : {}),
    };
  });
  const saveBytes = decodeBase64(value.startSave);
  const decoded = await decodeSave(saveBytes, { contentLookup: options.contentLookup });
  return {
    snapshot: decoded.snapshot,
    worldOptions: decoded.worldOptions,
    inputs: { frames, actions },
    endStateFingerprint: value.endStateFingerprint,
  };
}
