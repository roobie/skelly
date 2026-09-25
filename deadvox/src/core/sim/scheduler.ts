// Runs systems at their own rates in simulation time (DESIGN.md, "Simulation
// architecture").
//
// - Fixed systems (physics, AI) always step by exactly their interval. A frame runs
//   as many steps as fit, up to a cap, so a long frame can't spiral.
// - Coarse systems (needs, fire, power) step at most once per frame, by all the time
//   that has built up since their last step. Under compression their step grows
//   instead of their tick count, so a compressed hour costs about the same per frame.

export interface System {
  readonly id: string;
  /** Simulation seconds between ticks. */
  readonly interval: number;
  readonly kind: 'fixed' | 'coarse';
  tick: (dt: number) => void;
}

/** Most fixed steps a system may run in one frame; beyond that, time is dropped. */
export const MAX_FIXED_STEPS = 8;

interface Slot {
  system: System;
  pending: number;
}

export class Scheduler {
  private readonly slots: Slot[] = [];
  /** Simulation seconds fixed systems dropped because a frame needed too many steps. */
  dropped = 0;

  add(system: System): void {
    if (this.slots.some((s) => s.system.id === system.id)) {
      throw new Error(`system "${system.id}" is already scheduled`);
    }
    this.slots.push({ system, pending: 0 });
  }

  /** Advances every system by `dt` simulation seconds, in the order they were added. */
  advance(dt: number): void {
    for (const slot of this.slots) {
      slot.pending += dt;
      const { system } = slot;
      if (system.kind === 'coarse') {
        if (slot.pending >= system.interval) {
          system.tick(slot.pending);
          slot.pending = 0;
        }
        continue;
      }
      let steps = 0;
      while (slot.pending >= system.interval && steps < MAX_FIXED_STEPS) {
        system.tick(system.interval);
        slot.pending -= system.interval;
        steps += 1;
      }
      if (slot.pending >= system.interval) {
        this.dropped += slot.pending;
        slot.pending %= system.interval;
      }
    }
  }
}
