import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/content.ts';

const SOURCE = 'test/fixtures/packs/lamp/lamp.json';
const baseModel = {
  id: 'lamp',
  file: 'assets/models/lamp.glb',
  parts: { body: { massKg: 1, centreOfMass: [0, 0, 0] } },
  grip: { at: [0.05, 0.02, 0] },
};
const slide = (direction: number[], travel: number) => ({
  stages: [{ kind: 'slide', direction, travel, share: 1 }],
  stops: [
    { name: 'rest', clock: 0 },
    { name: 'open', clock: 1 },
  ],
});
const cycle = {
  durationSimSeconds: 0.1,
  legs: [
    { to: 'open', seconds: 0.02 },
    { to: 'open', seconds: 0.01 },
    { to: 'rest', seconds: 0.05 },
  ],
};
const handCycle = {
  durationSimSeconds: 1.7,
  legs: [
    { to: 'open', seconds: 0.65 },
    { to: 'open', seconds: 0.3 },
    { to: 'rest', seconds: 0.05 },
  ],
};
const ejectDirection = [0.34, 0.2, 0.92].map((value) => value / Math.hypot(0.34, 0.2, 0.92));
const build = (model: unknown) => buildRegistry([{ source: SOURCE, data: { models: [model] } }]);
const messages = (model: unknown) => build(model).issues.map(({ message }) => message);

describe('optional action model metadata', () => {
  it('accepts named moving nodes, motions with stops, leg-based cycles, and unit ejection vectors', () => {
    const action = {
      parts: {
        carrier: {
          node: 'bolt-carrier:bolt-carrier',
          motion: slide([1, 0, 0], 0.074_75),
          modes: ['fire', 'hand'],
        },
        handle: {
          node: 'charging-handle:ar-charging-handle',
          motion: slide([1, 0, 0], 0.074_75),
          modes: ['hand'],
        },
      },
      fire: cycle,
      hand: handCycle,
      ejectAt: 0.72,
      ejectDirection,
      holdOpen: false,
      roundsPerSimMinute: 600,
    };
    const { registry, issues } = build({
      ...baseModel,
      anchors: { ejection: [-0.05, 0.02, 0.03] },
      gun: { action },
    });
    expect(issues).toEqual([]);
    expect(registry.models.get('lamp')?.gun?.action).toEqual({ ...action, roundsPerSimMinute: 10 });
    expect(registry.models.get('lamp')?.anchors?.ejection).toEqual([-0.05, 0.02, 0.03]);
  });

  it('admits a hand-only integral magazine but rejects modes without timelines and box round columns', () => {
    const model = {
      ...baseModel,
      anchors: Object.fromEntries([['loading_port', [0, -0.04, 0]]]),
      gun: {
        calibre: '12-gauge-00-buck',
        internalMagazine: { capacity: 4 },
        action: {
          parts: {
            carrier: { node: 'bolt-carrier:bolt-carrier', motion: slide([-1, 0, 0], 0.063_25), modes: ['hand'] },
          },
          hand: cycle,
          ejectAt: 0.76,
          ejectDirection,
          holdOpen: false,
        },
      },
    };
    expect(build(model).issues).toEqual([]);
    expect(
      messages({
        ...model,
        gun: {
          ...model.gun,
          action: { ...model.gun.action, parts: { carrier: { ...model.gun.action.parts.carrier, modes: ['fire'] } } },
        },
      }),
    ).toContain('moving part modes must reference a declared timeline');
    expect(messages({ ...model, gun: { ...model.gun, capacity: 1, rounds: [{ at: [0, 0, 0], tilt: 0 }] } })).toContain(
      'internal magazine metadata needs calibre and cannot carry a box round column',
    );
  });

  it('requires a neutral loading anchor for an integral gun magazine', () => {
    const model = { ...baseModel, gun: { calibre: 'fixture-calibre', internalMagazine: { capacity: 1 } } };
    expect(build({ ...model, anchors: Object.fromEntries([['loading_port', [0, 0, 0]]]) }).issues).toEqual([]);
    expect(messages(model)).toContain('internal magazine metadata needs a loading_port anchor');
  });

  it('does not require gun action metadata on a neutral model', () => {
    const { registry, issues } = build(baseModel);
    expect(issues).toEqual([]);
    expect(registry.models.get('lamp')?.gun?.action).toBeUndefined();
    expect(registry.models.get('lamp')?.anchors?.ejection).toBeUndefined();
  });

  describe('rejects', () => {
    const baseAction = {
      parts: {
        carrier: { node: 'bolt-carrier:bolt-carrier', motion: slide([1, 0, 0], 0.074_75), modes: ['fire', 'hand'] },
      },
      fire: cycle,
      hand: handCycle,
      ejectAt: 0.72,
      ejectDirection,
      holdOpen: false,
      roundsPerSimMinute: 600,
    };
    const withAction = (action: object) => ({ ...baseModel, gun: { action: { ...baseAction, ...action } } });

    it('non-unit direction vectors', () => {
      const { issues } = build(withAction({ ejectDirection: [0, 0, 2] }));
      expect(issues.map(({ path }) => path)).toContain('models[0].gun.action.ejectDirection');
    });

    it('legs that exceed the duration', () => {
      const { issues } = build(withAction({ fire: { ...cycle, legs: [{ to: 'open', seconds: 0.2 }, ...cycle.legs] } }));
      expect(issues.map(({ path }) => path)).toContain('models[0].gun.action.fire');
    });

    it('a leg to a stop a part does not have', () => {
      const legs = [...handCycle.legs.slice(0, 2), { to: 'jammed', seconds: 0.05 }];
      expect(messages(withAction({ hand: { ...handCycle, legs } }))).toContain(
        'every timeline leg must go to a stop of each part that follows it',
      );
    });

    it('a timeline that leaves its parts away from rest', () => {
      const legs = handCycle.legs.slice(0, 2);
      expect(messages(withAction({ hand: { ...handCycle, legs } }))).toContain(
        'every timeline must end with its parts back at rest',
      );
    });

    it('a timeline that never draws to open', () => {
      const legs = [{ to: 'rest', seconds: 0.5 }];
      expect(messages(withAction({ hand: { ...handCycle, legs } }))).toContain(
        'every timeline must draw its parts back to open',
      );
    });
  });
});
