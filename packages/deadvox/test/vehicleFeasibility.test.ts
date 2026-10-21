import { describe, expect, it } from 'vitest';
import envelope from '../src/config/vehicleFeasibility.json' with { type: 'json' };
import type { Candidate, Observation } from '../src/vehicles/feasibility/contract.ts';
import { movingBody } from '../src/vehicles/feasibility/movingBody.ts';
import { runProbe, runSuite, TickDispatch } from '../src/vehicles/feasibility/runner.ts';
import { firstDivergence, trace } from '../src/vehicles/feasibility/trace.ts';

const create = () => movingBody.create(envelope.probe, envelope.tickHz);

describe('vehicle feasibility common harness', () => {
  it('preserves elapsed simulated time across caller partitions, stalls and compression (A1)', () => {
    const suite = runSuite('test-build');
    expect(suite.regular.traces.length).toBeGreaterThan(0);
    expect(suite.differences).toEqual([null, null, null]);
    expect(suite.restored.dispatch).toEqual(suite.regular.dispatch);
    expect(suite.regular.work.drivingSteps).toBe(envelope.probe.durationTicks);
    expect(suite.restored.restoreMilliseconds).toHaveLength(1);
  });

  it('retains unforced coasting momentum past debris expiry without importing debris (A2)', () => {
    const body = create();
    try {
      const before = body.observe();
      for (let tick = 0; tick < envelope.probe.durationTicks; tick++) {
        body.advance({ drive: false });
      }
      const after = body.observe();
      expect(after.tick).toBe(envelope.probe.durationTicks);
      expect(after.state.vx).toBe(before.state.vx);
      expect(after.state.x).toBeGreaterThan(before.state.x as number);
    } finally {
      body.dispose();
    }
  });

  it('caps dispatch work while retaining backlog and fractional phase across restore', () => {
    const body = create();
    const restored = create();
    try {
      const dispatch = new TickDispatch(body, envelope.quantaPerTick, envelope.maxTicksPerDispatch);
      const ticks = envelope.maxTicksPerDispatch + 1;
      dispatch.admit(ticks * envelope.quantaPerTick + envelope.probe.pendingQuantaAtSave);
      expect(
        dispatch.drain(
          () => ({}),
          () => undefined,
        ),
      ).toBe(envelope.maxTicksPerDispatch);
      const copy = new TickDispatch(restored, envelope.quantaPerTick, envelope.maxTicksPerDispatch);
      copy.restore(dispatch.snapshot());
      expect(
        copy.drain(
          () => ({}),
          () => undefined,
        ),
      ).toBe(1);
      expect(restored.observe().tick).toBe(ticks);
      expect(copy.snapshot().pendingQuanta).toBe(envelope.probe.pendingQuantaAtSave);
      const paused = trace(restored.observe());
      copy.admit(0);
      expect(
        copy.drain(
          () => ({}),
          () => undefined,
        ),
      ).toBe(0);
      expect(trace(restored.observe())).toEqual(paused);
    } finally {
      body.dispose();
      restored.dispose();
    }
  });

  it('reports the first planted numeric divergence by tick and field, including signed zero', () => {
    const body = create();
    try {
      body.advance({});
      const observed = body.observe();
      const baseline = [trace(observed)];
      const changed = trace({ ...observed, state: { ...observed.state, x: -0 } });
      expect(firstDivergence(baseline, [changed])).toMatchObject({ tick: observed.tick, field: 'state.x' });
      const zero = trace({ ...observed, state: { ...observed.state, x: 0 } });
      expect(firstDivergence([zero], [changed])?.field).toBe('state.x');
      expect(zero.fields.find(([field]) => field === 'state.x')?.[1]).toBe('000000000000000000');
      expect(changed.fields.find(([field]) => field === 'state.x')?.[1]).toBe('000000000000000080');
    } finally {
      body.dispose();
    }
  });

  it('detects the ordering mutant that reverses two ordered events at one tick', () => {
    const body = create();
    try {
      const observation = body.observe();
      const events = [
        { id: 'first', owner: 'probe' },
        { id: 'second', owner: 'probe' },
      ];
      const expected = trace({ ...observation, events });
      const mutant = trace({ ...observation, events: [...events].reverse() });
      expect(firstDivergence([expected], [mutant])).toMatchObject({ tick: 0, field: 'events[0].id' });
    } finally {
      body.dispose();
    }
  });

  it('detects a dropped simulated-step mutant rather than accepting a shorter trace', () => {
    const broken: Candidate = {
      identity: movingBody.identity,
      create: (fixture, hz) => {
        const body = movingBody.create(fixture, hz);
        return {
          advance: () => undefined,
          transition: (tier) => body.transition(tier),
          snapshot: () => body.snapshot(),
          restore: (snapshot) => body.restore(snapshot),
          observe: () => body.observe(),
          dispose: () => body.dispose(),
        };
      },
    };
    expect(() => runProbe('test-build', broken)).toThrow('Dropped or reordered simulated step');
  });

  it('detects the persistence mutant that loses controller phase on restore', () => {
    const broken: Candidate = {
      identity: movingBody.identity,
      create: (fixture, hz) => {
        const body = movingBody.create(fixture, hz);
        return {
          advance: (input) => body.advance(input),
          transition: (tier) => body.transition(tier),
          snapshot: () => body.snapshot(),
          restore: (snapshot) => {
            const bytes = snapshot.slice();
            new DataView(bytes.buffer).setFloat64(7 * 8, 0, true);
            body.restore(bytes);
          },
          observe: () => body.observe(),
          dispose: () => body.dispose(),
        };
      },
    };
    const baseline = runProbe('test-build');
    const mutant = runProbe('test-build', broken, { restore: true });
    expect(firstDivergence(baseline.traces, mutant.traces)).toMatchObject({
      tick: envelope.probe.saveAtTick + 1,
      field: 'state.phase',
    });
  });

  it('rejects nonfinite state and ground crossing without prescribing unsafe-edge behaviour', () => {
    const body = create();
    try {
      const observation: Observation = body.observe();
      expect(() => trace({ ...observation, state: { x: Number.NaN } })).toThrow('Nonfinite');
      expect(() => trace({ ...observation, minimumGroundClearance: -1 })).toThrow('Ground invariant');
      expect(() => trace({ ...observation, minimumGroundClearance: Number.NaN })).toThrow('Ground invariant');
    } finally {
      body.dispose();
    }
  });

  it('permits coarse transitions without killing momentum and parked bodies do no driving work', () => {
    const body = create();
    try {
      body.advance({});
      const velocity = body.observe().state.vx;
      body.transition('coarse');
      body.advance({});
      expect(body.observe().state.vx).toBe(velocity);
      body.transition('parked');
      const before = body.observe();
      body.advance({});
      expect(body.observe().work.drivingSteps).toBe(before.work.drivingSteps);
      expect(body.observe().state.x).toBe(before.state.x);
      body.dispose();
      expect(() => body.advance({})).toThrow('Disposed');
    } finally {
      body.dispose();
    }
  });
});
