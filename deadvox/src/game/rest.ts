// Rest controls/rate selection only. Core LongActions owns saved state and stepping.
import type { RestAction, RestKind } from '../core/longAction.ts';
import { REST } from '../core/needs.ts';
import type { Simulation } from '../core/sim.ts';

export interface RestHooks {
  bedQuality: () => number | undefined;
  notice: (text: string) => void;
}
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
  rateFor(kind: RestKind): number {
    if (kind === 'rest') {
      return REST.rest;
    }
    const quality = this.hooks.bedQuality();
    return quality === undefined ? REST.sleep : REST.sleep + REST.bedBonus * quality;
  }
  start(kind: RestKind): string | undefined {
    return this.sim.actions.startRest(kind, this.rateFor(kind));
  }
  resume(): string | undefined {
    return this.sim.actions.resume();
  }
  stop(): void {
    this.sim.actions.stop();
  }
  toggle(kind: RestKind): string | undefined {
    if (this.action?.kind === kind) {
      this.stop();
      return undefined;
    }
    return this.start(kind);
  }
  frame(realDt: number, until?: number): void {
    this.sim.frame(realDt, until);
  }
}
