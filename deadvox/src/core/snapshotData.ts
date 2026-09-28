/** Plain-data values used by in-memory save snapshots (not a disk encoding). */
export type SnapshotValue = null | boolean | number | string | SnapshotValue[] | { [key: string]: SnapshotValue };

/** Recursively freezes a freshly-created tree of plain snapshot values. */
export const freezeSnapshot = <T>(value: T): Readonly<T> => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      freezeSnapshot(child);
    }
    Object.freeze(value);
  }
  return value;
};

/** Makes an isolated, plain-data copy. Call only with acyclic structured-cloneable data. */
export const cloneSnapshot = <T>(value: T): T => structuredClone(value);
