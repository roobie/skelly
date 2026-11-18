import { describe, expect, it } from 'vitest';
import { DEFAULT_REPLAY_START_STATE, INPUT_REPLAY_SCHEMA_VERSION } from '../src/game/inputReplay.ts';
import { parseReplayWire, type ReplayWire } from '../src/input.ts';

const wire: ReplayWire = {
  magic: 'SKELLY_REPLAY',
  schemaVersion: INPUT_REPLAY_SCHEMA_VERSION,
  startSave: '',
  startState: DEFAULT_REPLAY_START_STATE,
  frames: [[0, 0, 0, 0, 0, 1, 0, 0]],
  actions: [],
  generatedColumns: [],
  columnChanges: [],
  endStateFingerprint: '0'.repeat(64),
  endSimTimestamp: 0,
};

describe('replay wire', () => {
  it('rejects a field outside the wire format without decoding the starting save', () => {
    expect(parseReplayWire(structuredClone(wire))).toEqual(wire);
    expect(() => parseReplayWire({ ...structuredClone(wire), endSimTime: 0 })).toThrow(
      'Replay is missing its starting save or input sequence',
    );
  });
});
