/** Exact shot deadlines sampled by the existing player scheduler; no wall-clock timers. */
export class DebugFirearmTrigger {
  private burst: { uid: number; roundsPerSimSecond: number; start: number; next: number } | undefined;
  advance(
    time: number,
    weapon: { uid: number; roundsPerSimSecond: number } | undefined,
    pressed: boolean,
    held: boolean,
  ): number[] {
    if (!(weapon && (pressed || held))) {
      this.burst = undefined;
      return [];
    }
    if (!held) {
      this.burst = undefined;
      return [time];
    }
    if (
      pressed ||
      !this.burst ||
      this.burst.uid !== weapon.uid ||
      this.burst.roundsPerSimSecond !== weapon.roundsPerSimSecond
    ) {
      this.burst = { ...weapon, start: time, next: 0 };
    }
    const interval = 1 / weapon.roundsPerSimSecond;
    const shots: number[] = [];
    let deadline = this.burst.start + this.burst.next * interval;
    while (deadline <= time + 1e-9) {
      shots.push(deadline);
      this.burst.next += 1;
      deadline = this.burst.start + this.burst.next * interval;
    }
    return shots;
  }
}
