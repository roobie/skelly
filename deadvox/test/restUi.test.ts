// @vitest-environment happy-dom
import { render } from 'lit-html';
import { describe, expect, it } from 'vitest';
import { formatClock, simSecondsPerHour } from '../src/core/clock.ts';
import type { RestAction } from '../src/core/longAction.ts';
import { realSeconds } from '../src/core/time.ts';
import { advanceLiveFrame } from '../src/game/frameDriver.ts';
import { labelForAction } from '../src/game/inputBindings.ts';
import { DEFAULT_HUD_OPTIONS, hudVisibility } from '../src/ui/hudOptions.ts';
import { restViewModel } from '../src/ui/rest.ts';
import { Simulation } from './simulationFixture.ts';

const restLabels = { rest: 'fixture rest', sleep: 'fixture sleep' };
const hiddenMessages = { messagesVisible: false, restLabels };

describe('restViewModel', () => {
  it('is invisible with no action running', () => {
    const sim = new Simulation({ seed: 1 });
    expect(restViewModel(undefined, false, sim, hiddenMessages).visible).toBe(false);
  });

  it('shows the content label for the rest kind, the clock and progress, with no prompt while not interrupted', () => {
    const sim = new Simulation({ seed: 1 });
    const action: RestAction = { kind: 'sleep', furnitureUid: 1, rate: -30, startFatigue: 50 };
    sim.needs.fatigue = 25;
    const vm = restViewModel(action, false, sim, hiddenMessages);
    expect(vm.visible).toBe(true);
    expect(vm.label).toBe(restLabels.sleep);
    expect(restViewModel({ ...action, kind: 'rest' }, false, sim, hiddenMessages).label).toBe(restLabels.rest);
    expect(vm.percent).toBe(50);
    expect(vm.prompt).toBeUndefined();
    expect(vm.clock).toBe(formatClock(sim.calendar));
  });

  it('tracks an alarm sleep toward its wake time, not toward rested', () => {
    const sim = new Simulation({ seed: 1 });
    sim.needs.fatigue = 0;
    const wakeAt = sim.time + simSecondsPerHour(sim.clock) * 8;
    expect(sim.actions.startRest('sleep', -10, 1, { wakeAt })).toBeUndefined();
    expect(restViewModel(sim.actions.rest, false, sim, hiddenMessages)).toMatchObject({
      visible: true,
      percent: 0,
    });
    const slept = () => (sim.actions.job?.jobType === 'sleep' ? sim.actions.job.elapsed : 0);
    for (let i = 0; i < 5000 && slept() === 0; i++) {
      advanceLiveFrame(sim, realSeconds(1 / 60));
    }
    const { visible, percent } = restViewModel(sim.actions.rest, false, sim, hiddenMessages);
    expect(visible).toBe(true);
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(100);
  });

  it('offers Stop during sleep onset but not after sleep begins', () => {
    const sim = new Simulation({ seed: 1 });
    const stopKey = labelForAction('handling.stop');
    const onset: RestAction = {
      kind: 'sleep',
      furnitureUid: 1,
      rate: -30,
      startFatigue: 40,
      sleepOnset: { durationGameSeconds: 100, elapsedGameSeconds: 50 },
    };
    const onsetVm = restViewModel(onset, true, sim, hiddenMessages);
    expect(onsetVm.percent).toBe(50);
    const hint = document.createElement('div');
    render(onsetVm.stopHint, hint);
    expect(hint.querySelector('.keycap')?.textContent).toBe(stopKey);
    expect(onsetVm.canStop).toBe(true);
    const asleep: RestAction = { kind: 'sleep', furnitureUid: 1, rate: -30, startFatigue: 40 };
    const asleepVm = restViewModel(asleep, false, sim, hiddenMessages);
    expect(asleepVm.stopHint).toBe('');
    expect(asleepVm.canStop).toBe(false);
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

    const action: RestAction = { kind: 'rest', furnitureUid: 1, rate: -15, startFatigue: 40 };
    const messagesVisible = (messages: boolean) =>
      hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true, messages }).messages;
    const hidden = restViewModel(action, true, sim, { messagesVisible: messagesVisible(false), restLabels });
    const visible = restViewModel(action, true, sim, { messagesVisible: messagesVisible(true), restLabels });
    expect(hidden.prompt).toBeUndefined();
    expect(visible.prompt).toBe(reason);
  });
});
