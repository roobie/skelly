import { describe, expect, it } from 'vitest';
import { RELOAD_GESTURE_MS, type ReloadBinding, ReloadInput } from '../src/game/reloadInput.ts';

const fixture = () => {
  const input = new ReloadInput();
  const calls = { loads: 0, racks: 0, cancelled: 0 };
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

describe('R hold/double discrimination', () => {
  it('a short single tap never admits a job, including after the double window expires', () => {
    const f = fixture();
    f.input.keyDown(0, f.binding);
    f.input.advance(100, f.binding);
    f.input.keyUp(101);
    f.input.advance(1000, f.binding);
    expect(f.calls).toEqual({ loads: 0, racks: 0, cancelled: 0 });
  });

  it('a double-press racks once without starting an insertion on either press', () => {
    const f = fixture();
    f.input.keyDown(0, f.binding);
    f.input.advance(100, f.binding);
    f.input.keyUp(101);
    f.input.keyDown(RELOAD_GESTURE_MS.doublePress - 1, f.binding);
    f.input.advance(1000, f.binding);
    f.input.keyUp(1001);
    expect(f.calls).toEqual({ loads: 0, racks: 1, cancelled: 0 });
  });

  it('a hold begins only at the threshold, waits for each job and cancels the partial job on release', () => {
    const f = fixture();
    f.input.keyDown(0, f.binding);
    f.input.advance(RELOAD_GESTURE_MS.hold - 1, f.binding);
    expect(f.calls.loads).toBe(0);
    f.input.advance(RELOAD_GESTURE_MS.hold, f.binding);
    f.input.advance(500, f.binding);
    expect(f.calls.loads).toBe(1);
    f.finish();
    f.input.advance(1200, f.binding);
    expect(f.calls.loads).toBe(2);
    f.input.keyUp(1300);
    f.input.advance(2500, f.binding);
    expect(f.calls).toEqual({ loads: 2, racks: 0, cancelled: 1 });
  });

  it('no further loading is retried after a full/no-ammo refusal until a fresh press', () => {
    const f = fixture();
    f.exhaust();
    f.input.keyDown(0, f.binding);
    f.input.advance(250, f.binding);
    f.input.advance(2000, f.binding);
    expect(f.calls.loads).toBe(1);
  });

  it('changing held item withdraws only the old binding intent and never loads the new hand implicitly', () => {
    const f = fixture();
    f.input.keyDown(0, f.binding);
    f.input.advance(250, f.binding);
    f.input.advance(500, { ...f.binding, uid: 9 });
    f.input.advance(1200, { ...f.binding, uid: 9 });
    expect(f.calls).toEqual({ loads: 1, racks: 0, cancelled: 1 });
  });
});
