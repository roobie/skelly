import { describe, expect, it } from 'vitest';
import {
  CAM_WRITE_INTERVAL_MS,
  type CamPose,
  camUrl,
  camValue,
  camWriteDue,
  parseCamParam,
  poseChanged,
} from '../src/debug/camUrl.ts';

const pose: CamPose = { position: [12.345, 1.6, -7.891], yaw: 1, pitch: -0.25, roll: 0 };
const params = (value: string) => new URLSearchParams({ cam: value });

describe('cam URL parameter', () => {
  it('writes metres to 2 decimals and degrees to 1, and reads it back to that precision', () => {
    expect(camValue(pose)).toBe('12.35,1.60,-7.89,57.3,-14.3,0.0');
    const back = parseCamParam(params(camValue(pose)))!;
    expect(back.position).toEqual([12.35, 1.6, -7.89]);
    expect(back.yaw).toBeCloseTo(pose.yaw, 2);
    expect(back.pitch).toBeCloseTo(pose.pitch, 2);
    expect(back.roll).toBe(0);
    // Stable: what was written parses to what writes the same text again.
    expect(camValue(back)).toBe(camValue(pose));
  });

  it('wraps yaw to [-180, 180) and clamps a hand-edited pitch like the mouse look', () => {
    expect(camValue({ ...pose, yaw: 3 * Math.PI })).toBe('12.35,1.60,-7.89,-180.0,-14.3,0.0');
    expect(parseCamParam(params('0,0,0,0,90,0'))!.pitch).toBeCloseTo(1.55, 9);
  });

  it('ignores a missing or malformed value without throwing', () => {
    for (const bad of [
      '',
      '1,2,3',
      '1,2,3,4,5',
      '1,2,3,4,5,6,7',
      'a,b,c,d,e,f',
      '1,2,,4,5,6',
      '1,2,3,4,5,Infinity',
      'NaN,0,0,0,0,0',
    ]) {
      expect(parseCamParam(params(bad))).toBeUndefined();
    }
    expect(parseCamParam(new URLSearchParams())).toBeUndefined();
  });

  it('sets cam in a URL and leaves every other parameter, path and hash alone', () => {
    const href = 'http://localhost:5173/play?debug=1&tone=aces&time=20:30&cam=0,0,0,0,0,0#x';
    const next = new URL(camUrl(href, pose));
    expect(next.searchParams.get('cam')).toBe('12.35,1.60,-7.89,57.3,-14.3,0.0');
    expect(next.search).toBe('?debug=1&tone=aces&time=20:30&cam=12.35,1.60,-7.89,57.3,-14.3,0.0');
    expect(next.pathname).toBe('/play');
    expect(next.hash).toBe('#x');
    expect(parseCamParam(next.searchParams)!.position).toEqual([12.35, 1.6, -7.89]);
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
