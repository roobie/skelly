import type { GraphicsTuningDef } from '@skelly/engine/content';
import { LOOK_PITCH_LIMIT } from '@skelly/engine/internal/game/playerControls.ts';
import { describe, expect, it } from 'vitest';
import {
  type CamPose,
  CamWriteTracker,
  camValue,
  camWriteDue,
  parseCamParam,
  poseChanged,
} from '../src/debug/camUrl.ts';
import { readHash, writeHash } from '../src/hashState.ts';

const pose: CamPose = { position: [12.345, 1.6, -7.891], yaw: 1, pitch: -0.25, roll: 0 };
const tuning = {
  settleRealSeconds: 1,
  positionWriteThresholdMetres: 5,
  rotationWriteThresholdDegrees: 45,
} as GraphicsTuningDef['debugCameraUrl'];

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

  it('writes after settling or a substantial move, unless forced, and never writes an unchanged pose', () => {
    const moved = { ...pose, position: [20, 1.6, 0] as CamPose['position'] };
    expect(camWriteDue({ last: pose, next: moved, elapsedRealMs: 999, tuning })).toBe(true);
    expect(
      camWriteDue({ last: pose, next: { ...pose, position: [13, 1.6, -7.891] }, elapsedRealMs: 999, tuning }),
    ).toBe(false);
    expect(
      camWriteDue({ last: pose, next: { ...pose, position: [13, 1.6, -7.891] }, elapsedRealMs: 1000, tuning }),
    ).toBe(true);
    expect(
      camWriteDue({ last: pose, next: { ...pose, yaw: pose.yaw + 0.1 }, elapsedRealMs: 0, tuning, force: true }),
    ).toBe(true);
    expect(camWriteDue({ last: pose, next: pose, elapsedRealMs: 10_000, tuning, force: true })).toBe(false);
    expect(camWriteDue({ last: undefined, next: pose, elapsedRealMs: 0, tuning })).toBe(true);
  });

  it('does not write on a timer while the camera keeps moving, then writes when it settles or moves materially', () => {
    const tracker = new CamWriteTracker();
    const written = { ...pose, position: [0, 1.6, 0] as CamPose['position'] };
    expect(tracker.writeDue({ last: written, next: written, realMs: 0, tuning })).toBe(false);

    let moving: CamPose = written;
    for (let step = 1; step <= 20; step++) {
      moving = { ...moving, position: [step * 0.2, 1.6, 0] };
      expect(tracker.writeDue({ last: written, next: moving, realMs: step * 750, tuning })).toBe(false);
    }

    expect(tracker.writeDue({ last: written, next: moving, realMs: 15_999, tuning })).toBe(false);
    expect(tracker.writeDue({ last: written, next: moving, realMs: 16_000, tuning })).toBe(true);
    expect(
      tracker.writeDue({ last: moving, next: { ...moving, position: [10, 1.6, 0] }, realMs: 16_001, tuning }),
    ).toBe(true);
  });
});
