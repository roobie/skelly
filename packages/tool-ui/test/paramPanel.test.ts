import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly, Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import type { Template } from '@skelly/engine/assembly/template.ts';
import { describe, expect, it } from 'vitest';
import {
  applyOverrides,
  buildPanelModel,
  clearParam,
  diffOverrides,
  EMPTY_OVERRIDES,
  initialOverrides,
  type PanelPart,
  parseOverrides,
  serializeOverrides,
  setParam,
  setSlotPresent,
} from '../src/paramPanel.ts';

const domain: Domain = {
  name: 'panel-fixture',
  families: {
    post: {
      name: 'post',
      params: {
        capped: { values: ['yes', 'no', 'fault'], default: 'yes', fault: ['fault'] },
        label: { values: ['a', 'b'], default: 'a' },
      },
      build: (params): PartDef => ({
        family: 'post',
        ports:
          params.capped === 'yes'
            ? [{ id: 'cap', mount: 'cap', gender: 'male', pos: [0, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] }]
            : [],
        solids: [],
        keepOuts: [],
        axes: [],
      }),
    },
    cap: {
      name: 'cap',
      params: { label: { values: ['a', 'b'], default: 'a', from: [{ port: 'attach', param: 'label' }] } },
      build: (): PartDef => ({
        family: 'cap',
        ports: [{ id: 'attach', mount: 'cap', gender: 'female', pos: [0, 0, 0], normal: [-1, 0, 0], up: [0, 1, 0] }],
        solids: [],
        keepOuts: [],
        axes: [],
      }),
    },
  },
  axisRules: [],
  units: { metresPerUnit: 1, grid: 0.001, bevel: 0 },
};
const baseline: Assembly = {
  name: 'post-cap',
  root: 'post',
  parts: { post: { family: 'post', params: { capped: 'yes' } }, cap: { family: 'cap' } },
  connections: [{ from: 'post.cap', to: 'cap.attach' }],
};
const template: Template = {
  name: 'post-cap',
  description: 'Parameter panel fixture',
  root: 'post',
  slots: [
    { id: 'post', family: 'post', params: { capped: ['yes'] } },
    { id: 'cap', family: 'cap', chance: 0.5, params: { label: { fromSlot: 'post', param: 'label' } } },
  ],
  connections: [{ from: 'post.cap', to: 'cap.attach' }],
};

describe('parameter panel', () => {
  it('uses URL overrides before saved state and does not leak saved edits into a selected model', () => {
    const saved = { params: { post: { label: 'b' } }, presence: {} };
    const fromUrl = { params: {}, presence: { cap: false } };
    expect(initialOverrides(saved, undefined, false)).toBe(saved);
    expect(initialOverrides(saved, undefined, true)).toBe(EMPTY_OVERRIDES);
    expect(initialOverrides(saved, fromUrl, true)).toBe(fromUrl);
  });

  it('lists family parameters, template permissions and adapter-supplied prefab metadata', () => {
    const prefab = { label: 'fixture', fixedParams: { capped: 'yes' }, stale: false };
    const entries = buildPanelModel(baseline, baseline, domain, { template, prefabsByPart: { post: prefab } });
    const post = entries.find((entry) => entry.id === 'post') as PanelPart;
    expect(post.params.map(({ name }) => name).sort()).toEqual(Object.keys(domain.families.post!.params).sort());
    expect(post.prefab).toBe(prefab);
    expect(post.params.find(({ name }) => name === 'capped')!.values).toEqual([
      { value: 'yes', permitted: true },
      { value: 'no', permitted: false },
    ]);
    const fixture = buildPanelModel(baseline, baseline, domain, undefined).filter((entry) => entry.present);
    expect(fixture.length).toBeGreaterThan(0);
    expect(
      fixture.every((entry) =>
        entry.params.every((param) => param.values.every((value) => value.permitted === undefined)),
      ),
    ).toBe(true);
  });

  it('updates inherited neighbours and permits only the referenced template value', () => {
    const edited = setParam(baseline, domain, { part: 'post', name: 'label' }, 'b').assembly;
    const cap = buildPanelModel(edited, baseline, domain, template).find(({ id }) => id === 'cap') as PanelPart;
    expect(cap.params).toEqual([
      {
        name: 'label',
        current: 'b',
        state: { kind: 'inherited', from: 'post.label' },
        values: [
          { value: 'a', permitted: false },
          { value: 'b', permitted: true },
        ],
      },
    ]);
  });

  it('marks user edits and restores implicit baseline values when cleared', () => {
    const edited = setParam(baseline, domain, { part: 'post', name: 'label' }, 'b');
    expect(edited.dropped).toEqual([]);
    const post = buildPanelModel(edited.assembly, baseline, domain, template)[0] as PanelPart;
    expect(post.params.find(({ name }) => name === 'label')!.state).toEqual({ kind: 'user' });
    const cleared = clearParam(edited.assembly, domain, baseline, { part: 'post', name: 'label' });
    expect(cleared.assembly).toEqual(baseline);
    expect(
      (buildPanelModel(cleared.assembly, baseline, domain, template)[0] as PanelPart).params.every(
        (param) => param.state.kind === 'seed',
      ),
    ).toBe(true);
  });

  it('prunes connections to removed ports and restores them on clear', () => {
    const pruned = setParam(baseline, domain, { part: 'post', name: 'capped' }, 'no');
    expect(pruned.dropped).toEqual(baseline.connections);
    expect(pruned.assembly.connections).toEqual([]);
    expect(resolve(pruned.assembly, domain).issues).toEqual([
      { rule: 'structure', message: 'cap is not connected to the root', parts: ['cap'] },
    ]);
    const restored = clearParam(pruned.assembly, domain, baseline, { part: 'post', name: 'capped' });
    expect(restored.dropped).toEqual([]);
    expect(restored.assembly).toEqual(baseline);
    const overrides = parseOverrides(serializeOverrides(diffOverrides(baseline, pruned.assembly)));
    expect(applyOverrides(baseline, domain, undefined, overrides)).toEqual(pruned.assembly);
  });

  it('offers absent optional slots and reconnects them from the template', () => {
    const off = setSlotPresent(baseline, template, 'cap', false);
    expect(off.connections).toEqual([]);
    expect(buildPanelModel(off, baseline, domain, template).find(({ id }) => id === 'cap')).toEqual({
      id: 'cap',
      family: 'cap',
      present: false,
      optional: true,
    });
    expect(setSlotPresent(off, template, 'cap', true)).toEqual(baseline);
    const edited = setParam(off, domain, { part: 'post', name: 'label' }, 'b').assembly;
    const overrides = diffOverrides(baseline, edited);
    expect(overrides.presence.cap).toBe(false);
    expect(overrides.params.post!.label).toBe('b');
    expect(applyOverrides(baseline, domain, template, parseOverrides(serializeOverrides(overrides)))).toEqual(edited);
  });
});
