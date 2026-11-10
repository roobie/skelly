// Rest controls/rate selection only. Core LongActions owns saved state and stepping.
import type { ActionText } from '../core/actionText.ts';
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
  text: ActionText;
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
  /**
   * The saved wake hour (`LongActions.wakeGameHour`). It only applies while an alarm is carried:
   * without a clock you can't time your waking.
   */
  get wakeGameHour(): number | undefined {
    return this.sim.actions.wakeGameHour;
  }
  set wakeGameHour(gameHour: number | undefined) {
    this.sim.actions.wakeGameHour = gameHour;
  }
  get canStop(): boolean {
    const { action } = this;
    return action !== undefined && (action.kind !== 'sleep' || action.sleepOnset !== undefined);
  }
  /** Whether the player can pick a wake time: only with an alarm clock. */
  get canSetWakeTime(): boolean {
    return this.hooks.hasAlarm();
  }
  start(kind: RestKind, furnitureUid: number): string | undefined {
    const { text } = this.hooks;
    const furniture = this.hooks.furniture(furnitureUid);
    if (!furniture || (kind === 'sleep' && !furniture.sleepable)) {
      return text.rest.unusable;
    }
    if (!this.hooks.withinReach(furnitureUid)) {
      return text.common.tooFar;
    }
    const wakeAt =
      kind === 'sleep' && this.wakeGameHour !== undefined && this.canSetWakeTime
        ? nextSimTimeAt(this.sim.clock, this.sim.time, this.wakeGameHour * SECONDS_PER_HOUR)
        : undefined;
    const rate = this.sim.body.fatigueRecoveryRate(kind, furniture.quality);
    const onsetTuning = kind === 'sleep' ? this.sim.body.tuning.sleepOnset : undefined;
    const onset = onsetTuning
      ? onsetTuning.maxGameMinutes -
        (onsetTuning.maxGameMinutes - onsetTuning.minGameMinutes) *
          Math.min(1, this.sim.needs.fatigue / onsetTuning.fatigueAtMinimum)
      : undefined;
    return this.sim.actions.startRest(kind, rate, furnitureUid, {
      ...(wakeAt === undefined ? {} : { wakeAt }),
      ...(onset === undefined ? {} : { sleepOnsetGameSeconds: onset }),
    });
  }
  resume(): string | undefined {
    const { action } = this;
    if (action) {
      const { text } = this.hooks;
      const furniture = this.hooks.furniture(action.furnitureUid);
      if (!furniture) {
        return text.common.gone;
      }
      if (!this.hooks.withinReach(action.furnitureUid)) {
        return text.common.tooFar;
      }
      if (action.kind === 'sleep' && !furniture.sleepable) {
        return text.rest.unusable;
      }
    }
    return this.sim.actions.resume();
  }
  /** System callers may stop rest or sleep; player toggles enforce `canStop`. */
  stop(): void {
    const { action } = this;
    if (action?.sleepOnset !== undefined) {
      this.sim.actions.cancel();
    } else if (action) {
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
