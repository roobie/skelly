import { describe, expect, it } from 'vitest';
import { clampShamblerCount, readShamblerCount, writeShamblerCount } from '../src/debug/shamblerCount.ts';

const storage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe('debug shambler count', () => {
  it('defaults to one and clamps values to integer counts from 1 to 100', () => {
    const store = storage();
    expect(readShamblerCount(store)).toBe(1);
    expect(clampShamblerCount(-4)).toBe(1);
    expect(clampShamblerCount(0)).toBe(1);
    expect(clampShamblerCount(1.8)).toBe(1);
    expect(clampShamblerCount(25)).toBe(25);
    expect(clampShamblerCount(101)).toBe(100);
    expect(clampShamblerCount(Number.NaN)).toBe(1);
  });

  it('persists the clamped count for the next debug-panel mount', () => {
    const store = storage();
    expect(writeShamblerCount(25, store)).toBe(25);
    expect(readShamblerCount(store)).toBe(25);
    expect(writeShamblerCount(1000, store)).toBe(100);
    expect(readShamblerCount(store)).toBe(100);
  });

  it('uses the default if localStorage reads or writes fail', () => {
    const broken = {
      getItem() {
        throw new Error('storage disabled');
      },
      setItem() {
        throw new Error('storage disabled');
      },
    };
    expect(readShamblerCount(broken)).toBe(1);
    expect(writeShamblerCount(25, broken)).toBe(25);
  });
});
