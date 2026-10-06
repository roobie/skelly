import { describe, expect, it } from 'vitest';
import { canonicalJsonBytes } from '../src/core/canonicalJson.ts';
import { encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import {
  decodeInputReplay,
  encodeInputReplay,
  INPUT_REPLAY_MAX_BYTES,
  joinInputReplayWindows,
  InputReplayRecorder,
  replayStateFingerprint,
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
    schemaVersion: 2,
    endStateFingerprint: '0'.repeat(64),
    startSave: btoa(Array.from(startSave, (byte) => String.fromCharCode(byte)).join('')),
    frames: inputs.frames,
    actions: inputs.actions,
  });

const dispatchWalkToggle = (
  runtime: ReturnType<typeof createRuntime>,
  phase: 'down' | 'up',
  recorder?: InputReplayRecorder,
): void => {
  recorder?.queueAction('movement.walk-toggle', phase, 'play');
  if (phase === 'down') {
    runtime.view.walk = !runtime.view.walk;
    runtime.view.intent.walk = runtime.view.walk;
  }
};

const recordActiveSession = (start: Readonly<SaveSnapshot>, recorder: InputReplayRecorder) => {
  const source = createRuntime(start, false, undefined, (tick, live, _time, compression) => {
    const sample = { ...live, yaw: tick / 100 };
    recorder.recordTick(sample, compression);
    return sample;
  });
  source.sim.paused = false;
  source.view.intent.forward = 1;
  let sentDown = false;
  let sentUp = false;
  const frameDts = [1 / 90, 1 / 60, 1 / 120];
  for (let frame = 0; recorder.tickCount < 96; frame += 1) {
    if (!sentDown && recorder.tickCount >= 12) {
      dispatchWalkToggle(source, 'down', recorder);
      sentDown = true;
    }
    if (!sentUp && recorder.tickCount >= 48) {
      dispatchWalkToggle(source, 'up', recorder);
      sentUp = true;
    }
    source.session.frame(frameDts[frame % frameDts.length]!);
    if (frame > 400) {
      throw new Error('Source session did not reach the recorded tick window');
    }
  }
  return source;
};

const playSession = (start: Readonly<SaveSnapshot>, inputs: ReplayInputData) => {
  let replay!: ReturnType<typeof createRuntime>;
  const player = new InputReplayPlayer(inputs, (action) => dispatchWalkToggle(replay, action.phase));
  replay = createRuntime(start, false, undefined, () => player.next()!);
  replay.sim.paused = false;
  for (let frame = 0; !player.finished; frame += 1) {
    replay.sim.compression.c = player.peek()?.compression ?? replay.sim.compression.c;
    replay.session.frameReplay(1 / 60);
    if (frame > inputs.frames.length + 24) {
      throw new Error('Replay session did not consume its recorded inputs');
    }
  }
  return replay;
};

describe('input replay', () => {
  it('joins adjacent recording windows and offsets semantic actions from the earlier start save', () => {
    const frame = (yaw: number) => [yaw, 0, 0, 0, 1, 1] as const;
    const action = (tick: number) => ({ tick, action: 'movement.walk-toggle', phase: 'down' as const, context: 'play' as const });
    const joined = joinInputReplayWindows(
      { frames: [frame(0.1)], actions: [action(0)] },
      { frames: [frame(0.2)], actions: [action(0)] },
    );
    expect(joined.frames).toEqual([frame(0.1), frame(0.2)]);
    expect(joined.actions.map(({ tick }) => tick)).toEqual([0, 1]);
  });

  it('bounds the always-on recording window and retained buffers', () => {
    const recorder = new InputReplayRecorder({} as Readonly<SaveSnapshot>);
    while (!recorder.full) {
      recorder.recordTick(replaySample);
    }

    expect(recorder.tickCount).toBeGreaterThan(0);
    expect(recorder.retainedBufferBytes).toBeLessThanOrEqual(INPUT_REPLAY_MAX_BYTES);
  });

  it('round-trips the resolved glowstick throw distance', async () => {
    const start = capture(createRuntime());
    const recorder = new InputReplayRecorder(start);
    recorder.queueAction('glowstick.throw', 'down', 'play', 2.5);
    recorder.recordTick(replaySample);
    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, start);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    expect(decoded.inputs.actions).toMatchObject([{ action: 'glowstick.throw', value: 2.5 }]);
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

    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, start);
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

  it('records active session movement and replays between-frame commands to the same state', async () => {
    const start = capture(createRuntime());
    const recorder = new InputReplayRecorder(start);
    const source = recordActiveSession(start, recorder);
    expect(recorder.tickCount).toBe(96);
    expect(source.player.body.pos).not.toEqual(start.character.player.body.pos);
    expect(source.view.walk).toBe(true);
    expect(recorder.copyInputs().actions.map(({ phase }) => phase)).toEqual(['down', 'up']);

    const sourceEnd = capture(source);
    const bytes = await encodeInputReplay(recorder.startSnapshot, recorder.copyInputs(), formatWorldOptions, sourceEnd);
    const decoded = await decodeInputReplay(bytes, { contentLookup });
    expect(decoded.endStateFingerprint).toBe(await replayStateFingerprint(sourceEnd));
    const replay = playSession(start, decoded.inputs);
    expect(await replayStateFingerprint(capture(replay))).toBe(await replayStateFingerprint(sourceEnd));
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
