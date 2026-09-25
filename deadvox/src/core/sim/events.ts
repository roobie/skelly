// Systems don't call each other; they emit events that other systems read on the next
// tick (DESIGN.md, "Simulation architecture"). Events emitted while draining wait for
// the following drain, so one tick's reactions never cascade within that tick.

export class EventQueue<E> {
  private queued: E[] = [];

  emit(event: E): void {
    this.queued.push(event);
  }

  get size(): number {
    return this.queued.length;
  }

  /** Returns every event emitted since the last drain, oldest first, and empties the queue. */
  drain(): E[] {
    const events = this.queued;
    this.queued = [];
    return events;
  }
}
