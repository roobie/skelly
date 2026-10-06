import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJsonBytes } from '../src/core/canonicalJson.ts';
import { encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import {
  decodeInputReplay,
  encodeInputReplay,
  INPUT_REPLAY_MAX_BYTES,
  InputReplayRecorder,
  type ReplayInputData,
} from '../src/game/inputReplay.ts';
import { InputReplayPlayer } from '../src/game/inputReplayPlayer.ts';
import { capture, contentLookup, createRuntime, formatVersion, formatWorldOptions } from './snapshotTestSupport.ts';

const INCOMPATIBLE_SAVE = /incompatible|version|identity/i;

const replaySample = {
  active: true,
  inputLocked: false,
  intent: {
    forward: 1,
    right: 0,
    jump: false,
    sprint: true,
    walk: false,
    useDominant: false,
    useDominantHeld: false,
    useOff: false,
  },
  yaw: 0.4,
  pitch: -0.2,
  walking: false,
  descending: false,
} as const;

const encodeFixtureReplay = (startSave: Uint8Array, inputs: ReplayInputData): Uint8Array =>
  canonicalJsonBytes({
    magic: 'DEADVOX_REPLAY',
    schemaVersion: 1,
    startSave: btoa(Array.from(startSave, (byte) => String.fromCharCode(byte)).join('')),
    frames: inputs.frames,
    actions: inputs.actions,
  });

describe('input replay', () => {
  it('bounds the always-on recording window and retained buffers', () => {
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    while (!recorder.full) {
      recorder.recordTick(replaySample);
    }

    expect(recorder.tickCount).toBeGreaterThan(0);
    expect(recorder.retainedBufferBytes).toBeLessThanOrEqual(INPUT_REPLAY_MAX_BYTES);
  });

  it('records controls and dispatches semantic actions at their player tick in order', async () => {
    const runtime = createRuntime();
    const start: Readonly<SaveSnapshot> = capture(runtime);
    const recorder = new InputReplayRecorder(start);
    recorder.queueAction('movement.walk-toggle', 'down', 'play');
    recorder.recordTick(replaySample);
    recorder.queueAction('movement.walk-toggle', 'up', 'play');
    recorder.queueAction('world.interact', 'down', 'play');
    recorder.recordTick({ ...replaySample, yaw: 0.5, intent: { ...replaySample.intent, forward: 0 } });

    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    const seen: string[] = [];
    const player = new InputReplayPlayer(decoded.inputs, (action, sample) => {
      seen.push(`${action.phase}:${action.action}:${sample.yaw}`);
    });
    expect(player.next()).toMatchObject({ yaw: 0.4, intent: { forward: 1, sprint: true } });
    expect(player.next()).toMatchObject({ yaw: 0.5, intent: { forward: 0 } });
    expect(seen).toEqual(['down:movement.walk-toggle:0.4', 'up:movement.walk-toggle:0.5', 'down:world.interact:0.5']);
    expect(decoded.snapshot).toEqual(start);
  });

  it('replays fixed-tick controls to the same captured simulation state', () => {
    const initial = createRuntime();
    const start = capture(initial);
    const recorder = new InputReplayRecorder(start);
    const samples = Array.from({ length: 96 }, (_, tick) => ({
      ...replaySample,
      yaw: tick / 100,
      inputLocked: true,
      intent: { ...replaySample.intent, forward: tick % 3 === 0 ? 1 : 0 },
    }));
    const source = createRuntime(start, false, undefined, (tick) => {
      const sample = samples[tick]!;
      recorder.recordTick(sample, 4);
      return sample;
    });
    source.sim.paused = false;
    for (let step = 0; step < samples.length + 10 && recorder.tickCount < samples.length; step += 1) {
      source.sim.compression.c = 4;
      source.session.frameReplay(1 / 60);
    }
    expect(recorder.tickCount).toBe(samples.length);

    const player = new InputReplayPlayer(recorder.copyInputs(), () => undefined);
    const replay = createRuntime(start, false, undefined, () => player.next()!);
    replay.sim.paused = false;
    for (let step = 0; step < samples.length + 10 && !player.finished; step += 1) {
      replay.sim.compression.c = player.peek()?.compression ?? replay.sim.compression.c;
      replay.session.frameReplay(1 / 60);
    }
    expect(player.finished).toBe(true);
    const fingerprint = (runtime: ReturnType<typeof createRuntime>) =>
      createHash('sha256')
        .update(canonicalJsonBytes(capture(runtime)))
        .digest('hex');
    expect(fingerprint(replay)).toBe(fingerprint(source));
  });

  it('rejects a replay whose embedded start save has an incompatible simulation identity', async () => {
    const runtime = createRuntime();
    const start = capture(runtime);
    const incompatibleVersion = { ...formatVersion, simulationHash: 'b'.repeat(64) };
    const startSave = await encodeSave(start, {
      generation: 1,
      worldOptions: formatWorldOptions,
      version: incompatibleVersion,
    });
    const artifact = encodeFixtureReplay(startSave, {
      frames: [[0, 0, 0, 0, 1, 1]],
      actions: [],
    });
    await expect(decodeInputReplay(artifact, { contentLookup })).rejects.toThrow(INCOMPATIBLE_SAVE);
  });
});
