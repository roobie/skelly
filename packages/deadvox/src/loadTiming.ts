const PREFIX = 'deadvox load: ';

export const markLoad = (phase: string): string => {
  const name = `${PREFIX}${phase}`;
  performance.mark(name);
  return name;
};

/** Skips a phase whose start a start flow never marked: timing runs in the frame loop and must not stop play. */
export const measureLoad = (phase: string, start: string, end?: string): void => {
  if (performance.getEntriesByName(start, 'mark').length === 0) {
    return;
  }
  performance.measure(`${PREFIX}${phase}`, start, end);
};

export class LoadTiming {
  private firstFrame = false;
  private readonly debug: boolean;

  constructor(debug: boolean) {
    this.debug = debug;
  }

  mark(phase: string): string {
    return markLoad(phase);
  }

  measure(phase: string, start: string, end?: string): void {
    measureLoad(phase, start, end);
  }

  firstPlayableFrame(): void {
    if (this.firstFrame) {
      return;
    }
    this.firstFrame = true;
    const firstFrame = this.mark('first playable frame');
    this.measure('world generation, spawn and mesh build', `${PREFIX}world load start`, firstFrame);
    this.measure('total to first playable frame', `${PREFIX}entry module ready`, firstFrame);
    if (this.debug) {
      // biome-ignore lint/suspicious/noConsole: debug load diagnostics are intentionally console-only.
      console.table(
        performance
          .getEntriesByType('measure')
          .filter((entry) => entry.name.startsWith(PREFIX))
          .map((entry) => ({
            phase: entry.name.slice(PREFIX.length),
            realMs: Number(entry.duration.toFixed(1)),
          })),
      );
    }
  }
}
