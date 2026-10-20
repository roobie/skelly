const STORAGE_KEY = 'deadvox.shambler-spawn-count';

export type CountStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const clampShamblerCount = (value: number): number =>
  Number.isFinite(value) ? Math.max(1, Math.min(100, Math.trunc(value))) : 1;

export const readShamblerCount = (storage?: CountStorage): number => {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(STORAGE_KEY);
    if (value === null || value === undefined || value.trim() === '') {
      return 1;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clampShamblerCount(parsed) : 1;
  } catch {
    return 1;
  }
};

export const writeShamblerCount = (value: number, storage?: CountStorage): number => {
  const count = clampShamblerCount(value);
  try {
    (storage ?? globalThis.localStorage)?.setItem(STORAGE_KEY, String(count));
  } catch {
    // Storage can be unavailable in private or sandboxed contexts.
  }
  return count;
};
