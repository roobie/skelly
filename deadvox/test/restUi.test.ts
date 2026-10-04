import { describe, expect, it } from 'vitest';
import type { RestAction } from '../src/core/longAction.ts';
import { Simulation } from '../src/core/sim.ts';
import { restViewModel } from '../src/ui/rest.ts';

describe('restViewModel', () => {
  it('is invisible with no action running', () => {
    const sim = new Simulation({ seed: 1 });
    expect(restViewModel(undefined, sim).visible).toBe(false);
  });

  it('shows the label, clock and progress, with no prompt while not interrupted', () => {
    const sim = new Simulation({ seed: 1 });
    const action: RestAction = { kind: 'sleep', label: 'Sleeping', rate: -30, startFatigue: 50 };
    sim.needs.fatigue = 25;
    const vm = restViewModel(action, sim);
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe('Sleeping');
    expect(vm.percent).toBe(50);
    expect(vm.prompt).toBeUndefined();
    expect(vm.clock).toBe('Day 1, 19:30');
  });

  it('shows how to stop it, by kind', () => {
    const sim = new Simulation({ seed: 1 });
    const rest: RestAction = { kind: 'rest', label: 'Resting', rate: -15, startFatigue: 40 };
    expect(restViewModel(rest, sim).stopHint).toBe('R or X to stop');
    const sleep: RestAction = { kind: 'sleep', label: 'Sleeping', rate: -30, startFatigue: 40 };
    expect(restViewModel(sleep, sim).stopHint).toBe('L or X to stop');
  });

  it('carries the interruption reason as the prompt', () => {
    let danger: string | undefined;
    const sim = new Simulation({ seed: 1, unsafe: () => danger });
    sim.compress();
    sim.frame(1);
    danger = 'A shambler is close';
    sim.frame(1 / 60);
    const action: RestAction = { kind: 'rest', label: 'Resting', rate: -15, startFatigue: 40 };
    expect(restViewModel(action, sim).prompt).toBe('A shambler is close');
  });
});
