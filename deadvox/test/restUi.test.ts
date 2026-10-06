import { describe, expect, it } from 'vitest';
import { formatClock } from '../src/core/clock.ts';
import type { RestAction } from '../src/core/longAction.ts';
import { Simulation } from '../src/core/sim.ts';
import { labelForAction } from '../src/game/inputBindings.ts';
import { DEFAULT_HUD_OPTIONS, hudVisibility } from '../src/ui/hudOptions.ts';
import { restViewModel } from '../src/ui/rest.ts';

describe('restViewModel', () => {
  it('is invisible with no action running', () => {
    const sim = new Simulation({ seed: 1 });
    expect(restViewModel(undefined, false, sim, false).visible).toBe(false);
  });

  it('shows the label, clock and progress, with no prompt while not interrupted', () => {
    const sim = new Simulation({ seed: 1 });
    const action: RestAction = { kind: 'sleep', furnitureUid: 1, label: 'Sleeping', rate: -30, startFatigue: 50 };
    sim.needs.fatigue = 25;
    const vm = restViewModel(action, false, sim, false);
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe(action.label);
    expect(vm.percent).toBe(50);
    expect(vm.prompt).toBeUndefined();
    expect(vm.clock).toBe(formatClock(sim.calendar));
  });

  it('offers cancellation for rest but not sleep', () => {
    const sim = new Simulation({ seed: 1 });
    const rest: RestAction = { kind: 'rest', furnitureUid: 1, label: 'Resting', rate: -15, startFatigue: 40 };
    const stopKey = labelForAction('handling.stop');
    const restVm = restViewModel(rest, true, sim, false);
    expect(restVm.stopHint).toContain(stopKey);
    expect(restVm.canStop).toBe(true);
    const sleep: RestAction = { kind: 'sleep', furnitureUid: 1, label: 'Sleeping', rate: -30, startFatigue: 40 };
    const sleepVm = restViewModel(sleep, false, sim, false);
    expect(sleepVm.stopHint).toBe('');
    expect(sleepVm.canStop).toBe(false);
  });

  it('shows a live interruption reason only when messages are visible', () => {
    const sim = new Simulation({ seed: 1 });
    const reason = 'fixture interruption reason';
    expect(sim.compress().ok).toBe(true);
    sim.frame(1);
    sim.emit({ kind: 'interrupt', reason });
    sim.frame(1 / 60);
    expect(sim.compression.active).toBe(false);
    expect(sim.compression.interruption).toBe(reason);

    const action: RestAction = { kind: 'rest', furnitureUid: 1, label: 'Resting', rate: -15, startFatigue: 40 };
    const hidden = restViewModel(action, true, sim, hudVisibility(DEFAULT_HUD_OPTIONS).messages);
    const visible = restViewModel(
      action,
      true,
      sim,
      hudVisibility({ ...DEFAULT_HUD_OPTIONS, messages: true }).messages,
    );
    expect(hidden.prompt).toBeUndefined();
    expect(visible.prompt).toBe(reason);
  });
});
