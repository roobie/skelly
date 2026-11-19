/**
 * Marks each startup phase once, as a `deadvox load:` performance mark whose detail carries the play frame it
 * completed on. Loading paces work per frame, and software rendering makes frames slow, so frames say what
 * time alone cannot: whether a phase waited on work or on the frame rate.
 */
export class LoadPhases {
  private frames = 0;
  private readonly marked = new Set<string>();

  /** Counts one play frame. */
  frame(): void {
    this.frames += 1;
  }

  /** Marks `phase` the first time it is reached and returns the mark's name. */
  mark(phase: string): string {
    const name = `deadvox load: ${phase}`;
    if (!this.marked.has(phase)) {
      this.marked.add(phase);
      performance.mark(name, { detail: { frame: this.frames } });
    }
    return name;
  }

  /** Marks `phase` once `reached` holds; `reached` is not evaluated again after that. */
  markWhen(phase: string, reached: () => boolean): void {
    if (!this.marked.has(phase) && reached()) {
      this.mark(phase);
    }
  }
}
