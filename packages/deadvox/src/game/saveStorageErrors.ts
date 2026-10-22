export type SaveStorageErrorKind = 'lock' | 'conflict';

export class SaveStorageLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveStorageLockError';
  }
}

export class SaveStorageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveStorageConflictError';
  }
}

/** The kind the save worker sends beside an error message, since a thrown class cannot cross the message boundary. */
export const saveStorageErrorKind = (error: unknown): SaveStorageErrorKind | undefined => {
  if (error instanceof SaveStorageLockError) {
    return 'lock';
  }
  return error instanceof SaveStorageConflictError ? 'conflict' : undefined;
};

export const reviveSaveStorageError = (message: string, kind: SaveStorageErrorKind | undefined): Error => {
  if (kind === 'lock') {
    return new SaveStorageLockError(message);
  }
  return kind === 'conflict' ? new SaveStorageConflictError(message) : new Error(message);
};
