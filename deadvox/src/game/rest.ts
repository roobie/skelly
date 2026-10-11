// Rest controls/rate selection only. Core LongActions owns saved state and stepping.
import { nextSimTimeAt, SECONDS_PER_HOUR } from '../core/clock.ts';
import type { RestAction, RestKind } from '../core/longAction.ts';
import type { Simulation } from '../core/sim.ts';
import { simSeconds } from '../core/time.ts';

interface RestFurniture {
  quality: number;
  sleepable: boolean;
}

export interface RestHooks {
  furniture: (uid: number) => RestFurniture | undefined;
  withinReach: (uid: number) => boolean;
  notice: (text: string) => void;
  /** Whether the player carries a working alarm clock (an item with `alarm`). */
  hasAlarm: () => boolean;
}

export const restKindForFurniture = (furniture: {
  rest?: { quality: number; sleep?: true | undefined } | undefined;
}): RestKind | undefined => {
  if (furniture.rest === undefined) {
    return undefined;
  }
  return furniture.rest.sleep ? 'sleep' : 'rest';
};

export class RestController {
  /**
   * The hour of day (0–23) the player wants to wake at, or undefined to sleep until rested. It only
   * applies while an alarm is carried: without a clock you can't time your waking.
   */
  wakeGameHour: number | undefined;
  private readonly sim: Simulation;
  private readonly hooks: RestHooks;
  constructor(sim: Simulation, hooks: RestHooks) {
    this.sim = sim;
    this.hooks = hooks;
    sim.actions.notice = hooks.notice;
  }
  get action(): RestAction | undefined {
    return this.sim.actions.rest;
  }
  get canStop(): boolean {
    return this.action !== undefined && this.action.kind !== 'sleep';
  }
  /** Whether the player can pick a wake time: only with an alarm clock. */
  get canSetWakeTime(): boolean {
    return this.hooks.hasAlarm();
  }
  start(kind: RestKind, furnitureUid: number): string | undefined {
    const furniture = this.hooks.furniture(furnitureUid);
    if (!furniture || (kind === 'sleep' && !furniture.sleepable)) {
      return 'That furniture cannot be used for this action';
    }
    if (!this.hooks.withinReach(furnitureUid)) {
      return 'Too far away';
    }
    const wakeAt =
      kind === 'sleep' && this.wakeGameHour !== undefined && this.canSetWakeTime
        ? nextSimTimeAt(this.sim.clock, this.sim.time, this.wakeGameHour * SECONDS_PER_HOUR)
        : undefined;
    const rate = this.sim.body.fatigueRecoveryRate(kind, furniture.quality);
    return this.sim.actions.startRest(kind, rate, furnitureUid, wakeAt);
  }
  resume(): string | undefined {
    const { action } = this;
    if (action) {
      const furniture = this.hooks.furniture(action.furnitureUid);
      if (!furniture) {
        return 'That furniture is no longer there';
      }
      if (!this.hooks.withinReach(action.furnitureUid)) {
        return 'Too far away';
      }
      if (action.kind === 'sleep' && !furniture.sleepable) {
        return 'That furniture cannot be used for this action';
      }
    }
    return this.sim.actions.resume();
  }
  /** System callers may stop rest or sleep; player toggles enforce `canStop`. */
  stop(): void {
    if (this.action) {
      this.sim.actions.stop();
    }
  }
  toggle(kind: RestKind, furnitureUid: number): string | undefined {
    if (this.action?.kind === kind && this.action.furnitureUid === furnitureUid) {
      if (this.canStop) {
        this.stop();
      }
      return undefined;
    }
    return this.start(kind, furnitureUid);
  }
  frame(simDt: number, until?: number): void {
    this.sim.frame(simSeconds(simDt), until);
  }
  frameReplay(realSeconds: number): void {
    this.sim.frameReplay(realSeconds);
  }
}
