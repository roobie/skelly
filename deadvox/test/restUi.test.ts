import { describe, expect, it } from 'vitest';
import { formatClock } from '../src/core/clock.ts';
import type { RestAction } from '../src/core/longAction.ts';
import { Simulation } from '../src/core/sim.ts';
import { labelForCode } from '../src/game/controls.ts';
import { CONTROL_CODES } from '../src/game/input.ts';
import { restViewModel } from '../src/ui/rest.ts';

describe('restViewModel', () => {
  it('is invisible with no action running', () => {
    const sim = new Simulation({ seed: 1 });
    expect(restViewModel(undefined, sim).visible).toBe(false);
  });

  it('shows the label, clock and progress, with no prompt while not interrupted', () => {
    const sim = new Simulation({ seed: 1 });
    const action: RestAction = { kind: 'sleep', furnitureUid: 1, label: 'Sleeping', rate: -30, startFatigue: 50 };
    sim.needs.fatigue = 25;
    const vm = restViewModel(action, sim);
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe(action.label);
    expect(vm.percent).toBe(50);
    expect(vm.prompt).toBeUndefined();
    expect(vm.clock).toBe(formatClock(sim.calendar));
  });

  it('shows how to stop it, by kind', () => {
    const sim = new Simulation({ seed: 1 });
    const rest: RestAction = { kind: 'rest', furnitureUid: 1, label: 'Resting', rate: -15, startFatigue: 40 };
    const stopKey = labelForCode(CONTROL_CODES.cancel);
    const sleepKey = labelForCode(CONTROL_CODES.sleep);
    expect(restViewModel(rest, sim).stopHint).toContain(stopKey);
    expect(restViewModel(rest, sim).stopHint).not.toContain(sleepKey);
    const sleep: RestAction = { kind: 'sleep', furnitureUid: 1, label: 'Sleeping', rate: -30, startFatigue: 40 };
    expect(restViewModel(sleep, sim).stopHint).toContain(stopKey);
    expect(restViewModel(sleep, sim).stopHint).toContain(sleepKey);
  });

  it('carries the interruption reason as the prompt', () => {
    let danger: string | undefined;
    const sim = new Simulation({ seed: 1, unsafe: () => danger });
    sim.compress();
    sim.frame(1);
    danger = 'A shambler is close';
    sim.frame(1 / 60);
    const action: RestAction = { kind: 'rest', furnitureUid: 1, label: 'Resting', rate: -15, startFatigue: 40 };
    expect(restViewModel(action, sim).prompt).toBe(danger);
  });
});
