export class PlayerTickActions {
  private pending: (() => void)[] = [];

  enqueue(action: () => void): void {
    this.pending.push(action);
  }

  applyAtNextTick(): void {
    const actions = this.pending;
    this.pending = [];
    for (const action of actions) {
      action();
    }
  }
}
