import { describe, expect, it } from 'vitest';
import { parseCameraState, serializeCameraState } from '../src/viewer/cameraState.ts';

describe('camera URL state', () => {
  it('round-trips camera position and target at shareable precision', () => {
    const state = {
      position: [3.1254, 1.84, 7.4],
      target: [0.12, 0.25, -0.0001],
    } as const;

    const text = serializeCameraState(state);
    expect(text).toBe('3.125,1.84,7.4,0.12,0.25,0');
    expect(parseCameraState(text)).toEqual({
      position: [3.125, 1.84, 7.4],
      target: [0.12, 0.25, 0],
    });
  });

  it.each([null, '', '1,2,3', '1,2,3,4,5,nope', '1,2,3,4,5,Infinity', '1,2,3,4,5,'])(
    'rejects invalid state %j',
    (value) => {
      expect(parseCameraState(value)).toBeUndefined();
    },
  );
});
