/** Emits once when a player's wounds transition from not bleeding to bleeding. */
export class PlayerBleedingNotice {
  private bleeding: boolean;

  constructor(initiallyBleeding: boolean) {
    this.bleeding = initiallyBleeding;
  }

  update(bleeding: boolean, notify: () => void): void {
    if (bleeding && !this.bleeding) {
      notify();
    }
    this.bleeding = bleeding;
  }
}
