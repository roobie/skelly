export type SaveStorageErrorKind = 'lock' | 'conflict';

/** A save storage failure the caller handles by kind; the worker sends `kind` beside the message. */
export class SaveStorageError extends Error {
  readonly kind: SaveStorageErrorKind;
  constructor(kind: SaveStorageErrorKind, message: string) {
    super(message);
    this.name = 'SaveStorageError';
    this.kind = kind;
  }
}
