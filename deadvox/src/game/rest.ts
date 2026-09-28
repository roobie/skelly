// Rest and sleep as long actions (SLICE-1.md, 1.8): compressed time, from the
// controller in 1.2, that recovers fatigue faster asleep than resting, and faster
// still on a bed. Interruptions (a shambler noticing you or coming close, damage, a
// need turning critical) are the simulation's own (core/sim.ts); this only starts
// the action, tracks its progress, and ends it on its own once you're fully rested.

import { REST } from '../core/needs.ts';
import type { Simulation } from '../core/sim.ts';
import { freezeSnapshot } from '../core/snapshotData.ts';

export type RestKind = 'rest' | 'sleep';

export const REST_LABEL: Readonly<Record<RestKind, string>> = { rest: 'Resting', sleep: 'Sleeping' };

export interface RestAction {
  readonly kind: RestKind;
  readonly label: string;
  /** Fatigue recovered per game hour; negative. */
  readonly rate: number;
  /** Fatigue when the action started, for the progress bar. */
  readonly startFatigue: number;
}

export interface RestHooks {
  /** The best bed's quality within reach, if the player is on or near one. */
  bedQuality: () => number | undefined;
  notice: (text: string) => void;
}

export class RestController {
  action: RestAction | undefined;
  private readonly sim: Simulation;
  private readonly hooks: RestHooks;

  snapshotState(): Readonly<{ action?: RestAction }> {
    return freezeSnapshot(this.action === undefined ? {} : { action: { ...this.action } });
  }

  restoreState(state: { action?: RestAction }): void {
    this.action = state.action === undefined ? undefined : { ...state.action };
  }

  constructor(sim: Simulation, hooks: RestHooks) {
    this.sim = sim;
    this.hooks = hooks;
  }

  /** The fatigue recovery rate `kind` gives right now, in percent per game hour. */
  rateFor(kind: RestKind): number {
    if (kind === 'rest') {
      return REST.rest;
    }
    const quality = this.hooks.bedQuality();
    return quality === undefined ? REST.sleep : REST.sleep + REST.bedBonus * quality;
  }

  /** Starts resting or sleeping. Returns why not when refused: not tired, or unsafe. */
  start(kind: RestKind): string | undefined {
    if (this.sim.needs.fatigue <= 0) {
      return "You're not tired";
    }
    const rate = this.rateFor(kind);
    const result = this.sim.compress();
    if (!result.ok) {
      return result.reason;
    }
    this.action = { kind, label: REST_LABEL[kind], rate, startFatigue: this.sim.needs.fatigue };
    return undefined;
  }

  /** Continues after an interruption. Returns why not when it's still unsafe. */
  resume(): string | undefined {
    if (!this.action) {
      return undefined;
    }
    const result = this.sim.compress();
    return result.ok ? undefined : result.reason;
  }

  /** Stops the action for good; safe to call when none is running. */
  stop(): void {
    this.action = undefined;
    this.sim.compression.stop();
  }

  /**
   * The same key pressed again: starts `kind`, or stops it if it's already running (a manual
   * stop, same as an interruption's Stop). Returns why not when refused to start.
   */
  toggle(kind: RestKind): string | undefined {
    if (this.action?.kind === kind) {
      this.stop();
      return undefined;
    }
    return this.start(kind);
  }

  /** Advances one real frame. Ends the action on its own once fatigue reaches 0. */
  frame(realDt: number): void {
    this.sim.frame(realDt);
    if (this.action && this.sim.compression.interruption === undefined && this.sim.needs.fatigue <= 0) {
      this.action = undefined;
      this.sim.compression.stop();
      this.hooks.notice('You feel rested');
    }
  }
}
