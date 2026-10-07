import { describe, expect, it } from 'vitest';
import { RELOAD_GESTURE_MS, type ReloadBinding, ReloadInput } from '../src/game/reloadInput.ts';

const shortTap = Math.min(RELOAD_GESTURE_MS.hold, RELOAD_GESTURE_MS.doublePress) / 3;
const afterWindows = Math.max(RELOAD_GESTURE_MS.hold, RELOAD_GESTURE_MS.doublePress) * 4;
const fixture = () => {
  const input = new ReloadInput();
  const calls = { loads: 0, racks: 0, removes: 0, cancelled: 0 };
  let busy = false;
  let available = true;
  const binding: ReloadBinding = {
    uid: 7,
    busy: () => busy,
    load: () => {
      calls.loads += 1;
      busy = available;
      return available;
    },
    rack: () => {
      calls.racks += 1;
    },
    remove: () => {
      calls.removes += 1;
    },
    cancelLoad: () => {
      calls.cancelled += 1;
      busy = false;
    },
  };
  return {
    input,
    calls,
    binding,
    finish: () => {
      busy = false;
    },
    exhaust: () => {
      available = false;
    },
  };
};

/** A tap, then the second press of the gesture at the last moment the double window allows. */
const tapThenPress = (f: ReturnType<typeof fixture>): number => {
  f.input.keyDown(0, f.binding);
  f.input.advance(shortTap, f.binding);
  f.input.keyUp(shortTap + 1);
  const second = RELOAD_GESTURE_MS.doublePress - 1;
  f.input.keyDown(second, f.binding);
  return second;
};

describe('R hold/double discrimination', () => {
  it('a short single tap never admits a job, including after the double window expires', () => {
    const f = fixture();
    f.input.keyDown(0, f.binding);
    f.input.advance(shortTap, f.binding);
    f.input.keyUp(shortTap + 1);
    f.input.advance(afterWindows, f.binding);
    expect(f.calls).toEqual({ loads: 0, racks: 0, removes: 0, cancelled: 0 });
  });
  it('a double-press racks once on its second release, however late before the hold threshold, and never removes', () => {
    const f = fixture();
    const second = tapThenPress(f);
    f.input.advance(second + RELOAD_GESTURE_MS.hold - 1, f.binding);
    expect(f.calls.racks).toBe(0);
    f.input.keyUp(second + RELOAD_GESTURE_MS.hold - 1);
    f.input.advance(afterWindows, f.binding);
    expect(f.calls).toEqual({ loads: 0, racks: 1, removes: 0, cancelled: 0 });
  });
  it('a tap, then a press held to the hold threshold, removes once and neither racks nor loads', () => {
    const f = fixture();
    const second = tapThenPress(f);
    f.input.advance(second + RELOAD_GESTURE_MS.hold - 1, f.binding);
    expect(f.calls.removes).toBe(0);
    f.input.advance(second + RELOAD_GESTURE_MS.hold, f.binding);
    f.input.advance(afterWindows, f.binding);
    f.input.keyUp(afterWindows + 1);
    expect(f.calls).toEqual({ loads: 0, racks: 0, removes: 1, cancelled: 0 });
  });
  it('a press starting after the double window is a fresh hold: it loads and never removes', () => {
    const f = fixture();
    f.input.keyDown(0, f.binding);
    f.input.keyUp(shortTap);
    const fresh = RELOAD_GESTURE_MS.doublePress;
    f.input.keyDown(fresh, f.binding);
    f.input.advance(fresh + afterWindows, f.binding);
    expect(f.calls).toEqual({ loads: 1, racks: 0, removes: 0, cancelled: 0 });
  });
  it('a hold begins only at the threshold, waits for each job and cancels the partial job on release', () => {
    const f = fixture();
    f.input.keyDown(0, f.binding);
    f.input.advance(RELOAD_GESTURE_MS.hold - 1, f.binding);
    expect(f.calls.loads).toBe(0);
    f.input.advance(RELOAD_GESTURE_MS.hold, f.binding);
    f.input.advance(RELOAD_GESTURE_MS.hold * 2, f.binding);
    expect(f.calls.loads).toBe(1);
    f.finish();
    f.input.advance(afterWindows, f.binding);
    expect(f.calls.loads).toBe(2);
    f.input.keyUp(afterWindows + 1);
    f.input.advance(afterWindows * 2, f.binding);
    expect(f.calls).toEqual({ loads: 2, racks: 0, removes: 0, cancelled: 1 });
  });
  it('no further loading is retried after a full/no-ammo refusal until a fresh press', () => {
    const f = fixture();
    f.exhaust();
    f.input.keyDown(0, f.binding);
    f.input.advance(RELOAD_GESTURE_MS.hold, f.binding);
    f.input.advance(afterWindows, f.binding);
    expect(f.calls.loads).toBe(1);
  });
  it('changing held item withdraws only the old binding intent and never loads the new hand implicitly', () => {
    const f = fixture();
    f.input.keyDown(0, f.binding);
    f.input.advance(RELOAD_GESTURE_MS.hold, f.binding);
    f.input.advance(RELOAD_GESTURE_MS.hold * 2, { ...f.binding, uid: 9 });
    f.input.advance(afterWindows, { ...f.binding, uid: 9 });
    expect(f.calls).toEqual({ loads: 1, racks: 0, removes: 0, cancelled: 1 });
  });
});
