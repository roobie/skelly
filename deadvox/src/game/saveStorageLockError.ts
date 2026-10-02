export class SaveStorageLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveStorageLockError';
  }
}
