import { LOOK_PITCH_LIMIT } from '@skelly/engine/internal/game/playerControls.ts';
import { describe, expect, it } from 'vitest';
import {
  CAM_WRITE_INTERVAL_MS,
  type CamPose,
  camValue,
  camWriteDue,
  parseCamParam,
  poseChanged,
} from '../src/debug/camUrl.ts';
import { readHash, writeHash } from '../src/hashState.ts';

const pose: CamPose = { position: [12.345, 1.6, -7.891], yaw: 1, pitch: -0.25, roll: 0 };

describe('cam hash key', () => {
  it('writes metres to 2 decimals and degrees to 1, and reads it back to that precision', () => {
    expect(camValue(pose)).toEqual([12.35, 1.6, -7.89, 57.3, -14.3, 0]);
    const back = parseCamParam({ cam: camValue(pose) })!;
    expect(back.position).toEqual([12.35, 1.6, -7.89]);
    expect(back.yaw).toBeCloseTo(pose.yaw, 2);
    expect(back.pitch).toBeCloseTo(pose.pitch, 2);
    expect(back.roll).toBe(0);
    // Stable: what was written parses to what writes the same values again.
    expect(camValue(back)).toEqual(camValue(pose));
  });

  it('wraps yaw to [-180, 180) and clamps a hand-edited pitch to the mouse-look limit', () => {
    expect(camValue({ ...pose, yaw: 3 * Math.PI })[3]).toBe(-180);
    expect(parseCamParam({ cam: [0, 0, 0, 0, 90, 0] })!.pitch).toBeCloseTo(LOOK_PITCH_LIMIT, 9);
    expect(parseCamParam({ cam: [0, 0, 0, 0, -90, 0] })!.pitch).toBeCloseTo(-LOOK_PITCH_LIMIT, 9);
  });

  it('ignores a missing value or one with the wrong count of numbers', () => {
    for (const bad of [[], [1, 2, 3], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6, 7]]) {
      expect(parseCamParam({ cam: bad })).toBeUndefined();
    }
    expect(parseCamParam({})).toBeUndefined();
  });

  it('comes back from the written hash text with the other keys', () => {
    const read = readHash(writeHash({ debug: true, cam: camValue(pose) }));
    expect('hash' in read && read.hash.debug).toBe(true);
    expect('hash' in read && parseCamParam(read.hash)!.position).toEqual([12.35, 1.6, -7.89]);
  });
});

describe('when the pose is written', () => {
  it('sees a change only past the written precision', () => {
    expect(poseChanged(undefined, pose)).toBe(true);
    expect(poseChanged(pose, { ...pose, position: [12.349, 1.6, -7.891] })).toBe(false);
    expect(poseChanged(pose, { ...pose, position: [12.4, 1.6, -7.891] })).toBe(true);
    expect(poseChanged(pose, { ...pose, yaw: pose.yaw + 0.01 })).toBe(true);
    expect(poseChanged(pose, { ...pose, pitch: pose.pitch + 0.0005 })).toBe(false);
    // Across the wrap point the yaw hasn't moved.
    expect(poseChanged({ ...pose, yaw: Math.PI }, { ...pose, yaw: -Math.PI })).toBe(false);
  });

  it('throttles to the interval, unless forced, and never writes an unchanged pose', () => {
    const moved = { ...pose, position: [20, 1.6, 0] as CamPose['position'] };
    expect(camWriteDue(pose, moved, CAM_WRITE_INTERVAL_MS - 1)).toBe(false);
    expect(camWriteDue(pose, moved, CAM_WRITE_INTERVAL_MS)).toBe(true);
    expect(camWriteDue(pose, moved, 0, true)).toBe(true);
    expect(camWriteDue(pose, pose, 10_000, true)).toBe(false);
    expect(camWriteDue(undefined, pose, 0)).toBe(true);
  });
});
