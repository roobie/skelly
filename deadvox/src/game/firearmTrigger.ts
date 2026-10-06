/** Exact shot deadlines sampled by the existing player scheduler; no wall-clock timers. */
export class FirearmTrigger {
  private burst: { uid: number; rpm: number; start: number; next: number } | undefined;
  advance(time: number, weapon: { uid: number; rpm: number } | undefined, pressed: boolean, held: boolean): number[] {
    if (!(weapon && (pressed || held))) {
      this.burst = undefined;
      return [];
    }
    if (!held) {
      this.burst = undefined;
      return [time];
    }
    if (pressed || !this.burst || this.burst.uid !== weapon.uid || this.burst.rpm !== weapon.rpm) {
      this.burst = { ...weapon, start: time, next: 0 };
    }
    const interval = 60 / weapon.rpm;
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
