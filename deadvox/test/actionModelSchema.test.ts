import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';

const SOURCE = 'test/fixtures/packs/lamp/lamp.json';
const baseModel = {
  id: 'lamp',
  file: 'assets/models/lamp.glb',
  grip: { at: [0.05, 0.02, 0] },
};
const cycle = {
  durationSeconds: 0.1,
  rearwardSeconds: 0.02,
  dwellSeconds: 0.01,
  forwardSeconds: 0.05,
};
const ejectDirection = [0.34, 0.2, 0.92].map((value) => value / Math.hypot(0.34, 0.2, 0.92));
const build = (model: unknown) => buildRegistry([{ source: SOURCE, data: { models: [model] } }]);

describe('optional action model metadata', () => {
  it('accepts named moving nodes, metre strokes, second-based cycles, and unit ejection vectors', () => {
    const action = {
      parts: {
        carrier: {
          node: 'bolt-carrier:bolt-carrier',
          axis: [1, 0, 0],
          strokeMetres: 0.074_75,
          modes: ['fire', 'hand'],
        },
        handle: {
          node: 'charging-handle:ar-charging-handle',
          axis: [1, 0, 0],
          strokeMetres: 0.074_75,
          modes: ['hand'],
        },
      },
      fire: cycle,
      hand: { durationSeconds: 1.7, rearwardSeconds: 0.65, dwellSeconds: 0.3, forwardSeconds: 0.05 },
      ejectAt: 0.72,
      ejectDirection,
      holdOpen: false,
      rpm: 600,
    };
    const { registry, issues } = build({
      ...baseModel,
      anchors: { ejection: [-0.05, 0.02, 0.03] },
      action,
    });
    expect(issues).toEqual([]);
    expect(registry.models.get('lamp')?.action).toEqual(action);
    expect(registry.models.get('lamp')?.anchors?.ejection).toEqual([-0.05, 0.02, 0.03]);
  });

  it('admits a hand-only integral tube but rejects modes without timelines and box round columns', () => {
    const model = {
      ...baseModel,
      calibre: '12-gauge-00-buck',
      anchors: Object.fromEntries([['loading_port', [0, -0.04, 0]]]),
      tube: { capacity: 4 },
      action: {
        parts: {
          carrier: { node: 'bolt-carrier:bolt-carrier', axis: [-1, 0, 0], strokeMetres: 0.063_25, modes: ['hand'] },
        },
        hand: cycle,
        ejectAt: 0.76,
        ejectDirection,
        holdOpen: false,
      },
    };
    expect(build(model).issues).toEqual([]);
    expect(
      build({
        ...model,
        action: { ...model.action, parts: { carrier: { ...model.action.parts.carrier, modes: ['fire'] } } },
      }).issues.map(({ message }) => message),
    ).toContain('moving part modes must reference a declared timeline');
    expect(
      build({ ...model, capacity: 1, rounds: [{ at: [0, 0, 0], tilt: 0 }] }).issues.map(({ message }) => message),
    ).toContain('tube metadata needs calibre/loading_port and cannot carry a box round column');
  });

  it('leaves action fields optional for existing model entries', () => {
    const { registry, issues } = build(baseModel);
    expect(issues).toEqual([]);
    expect(registry.models.get('lamp')?.action).toBeUndefined();
    expect(registry.models.get('lamp')?.anchors?.ejection).toBeUndefined();
  });

  it('rejects non-unit direction vectors and cycle phases that exceed the duration', () => {
    const baseAction = {
      parts: {
        carrier: {
          node: 'bolt-carrier:bolt-carrier',
          axis: [1, 0, 0],
          strokeMetres: 0.074_75,
          modes: ['fire', 'hand'],
        },
      },
      fire: cycle,
      hand: { durationSeconds: 1.7, rearwardSeconds: 0.65, dwellSeconds: 0.3, forwardSeconds: 0.05 },
      ejectAt: 0.72,
      ejectDirection,
      holdOpen: false,
      rpm: 600,
    };
    const invalidDirection = build({ ...baseModel, action: { ...baseAction, ejectDirection: [0, 0, 2] } });
    expect(invalidDirection.issues.map(({ path }) => path)).toContain('models[0].action.ejectDirection');
    const invalidCycle = build({ ...baseModel, action: { ...baseAction, fire: { ...cycle, forwardSeconds: 0.2 } } });
    expect(invalidCycle.issues.map(({ path }) => path)).toContain('models[0].action.fire');
  });
});
