// The event queue. Systems don't call each other: they emit events (noise, damage,
// block changes, interruptions), and other systems read them (DESIGN.md, "Events").

export interface EventReader<E> {
  /** The events emitted since this reader last read, oldest first. */
  read: () => readonly E[];
}

/**
 * Each reader sees every event emitted after it was created, once. Events are
 * dropped when every reader has seen them.
 */
export class EventQueue<E> {
  private events: E[] = [];
  /** Sequence number of events[0]. */
  private first = 0;
  private readonly cursors: { next: number }[] = [];

  emit(event: E): void {
    if (this.cursors.length > 0) {
      this.events.push(event);
    }
  }

  reader(): EventReader<E> {
    const cursor = { next: this.first + this.events.length };
    this.cursors.push(cursor);
    return {
      read: () => {
        const end = this.first + this.events.length;
        const seen = this.events.slice(cursor.next - this.first);
        cursor.next = end;
        this.trim();
        return seen;
      },
    };
  }

  /** Events waiting for at least one reader. */
  get pending(): number {
    return this.events.length;
  }

  private trim(): void {
    let oldest = this.first + this.events.length;
    for (const cursor of this.cursors) {
      oldest = Math.min(oldest, cursor.next);
    }
    if (oldest > this.first) {
      this.events = this.events.slice(oldest - this.first);
      this.first = oldest;
    }
  }
}
