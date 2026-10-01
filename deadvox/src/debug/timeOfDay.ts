// A debug-only time of day for the look experiments: the hour that sky, fog and light are drawn
// at can be stepped and frozen without touching the simulation. The clock, needs, zombies'
// night sight and saves all keep running on the real calendar; only play.ts's `applySky` asks
// this for the hour to draw.

const wrapHour = (hour: number): number => ((hour % 24) + 24) % 24;

export class TimeOfDayControls {
  /** Hours added to the simulation's hour, while following it. */
  private offsetHours = 0;
  /** The hour held while frozen. */
  private frozenAt: number | undefined;
  private readonly simHour: () => number;

  /** `simHour` is the simulation's hour of day in [0, 24). */
  constructor(simHour: () => number) {
    this.simHour = simHour;
  }

  get frozen(): boolean {
    return this.frozenAt !== undefined;
  }

  /** The hour of day to draw, in [0, 24). */
  hour(): number {
    return this.frozenAt ?? wrapHour(this.simHour() + this.offsetHours);
  }

  /** "HH:MM" of the hour to draw. */
  get label(): string {
    // A second of slack, so float drift in a stepped hour doesn't show 20:29 for 20:30.
    const minutes = Math.floor(this.hour() * 60 + 1 / 60);
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  /** Moves the drawn time by whole or fractional game hours, frozen or not. */
  step(hours: number): void {
    if (this.frozenAt === undefined) {
      this.offsetHours = wrapHour(this.offsetHours + hours);
    } else {
      this.frozenAt = wrapHour(this.frozenAt + hours);
    }
  }

  /** Freezing holds the hour on screen; thawing resumes from it, so the sky doesn't jump. */
  toggleFrozen(): void {
    if (this.frozenAt === undefined) {
      this.frozenAt = this.hour();
    } else {
      this.offsetHours = wrapHour(this.frozenAt - this.simHour());
      this.frozenAt = undefined;
    }
  }
}
