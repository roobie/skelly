export const applyToHeldItem = <T extends { readonly uid: number }>(
  hands: Partial<Record<'left' | 'right', T | undefined>>,
  hand: 'left' | 'right',
  itemUid: number,
  action: (item: T) => void,
): boolean => {
  const item = hands[hand];
  if (item?.uid !== itemUid) {
    return false;
  }
  action(item);
  return true;
};

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
