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
