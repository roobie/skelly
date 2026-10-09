// Fail-first proof for the parameter panel's pure logic (item
// gungen5-param-panel). No DOM or three.js: everything here works on plain
// Assembly objects, the same as resolve()/validate() do.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from '@skelly/engine/core/generate.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import type { Assembly, Domain, PartDef } from '@skelly/engine/core/schema.ts';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { ak, ar, battleRifle } from '../src/gun/templates.ts';
import { GUN_UNITS } from '../src/gun/units.ts';
import { buildDesignViewModel } from '../src/viewer/designViewModel.ts';
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
} from '../src/viewer/paramPanel.ts';
import { loadFixture } from './helpers.ts';

const isPresent = (entry: { present: boolean }): entry is PanelPart => entry.present;

describe('initial viewer overrides', () => {
  it('restores saved overrides for a bare viewer URL', () => {
    const saved = { params: { barrel: { length: 'L' } }, presence: { handguard: false } };
    expect(initialOverrides(saved, undefined, false)).toBe(saved);
  });

  it('starts model URLs empty unless they specify `set=` overrides', () => {
    const saved = { params: { barrel: { length: 'L' } }, presence: { handguard: false } };
    const fromUrl = { params: { barrel: { length: 'M' } }, presence: {} };
    expect(initialOverrides(saved, undefined, true)).toBe(EMPTY_OVERRIDES);
    expect(initialOverrides(saved, fromUrl, true)).toBe(fromUrl);
    expect(initialOverrides(saved, EMPTY_OVERRIDES, true)).toBe(EMPTY_OVERRIDES);
  });
});

describe('param panel: listing', () => {
  it('lists exactly the params of every part in a generated AK', () => {
    const assembly = generate(ak, gunDomain, 3);
    const model = buildPanelModel(assembly, assembly, gunDomain, ak);
    const present = model.filter(isPresent);
    expect(present.map((p) => p.id).sort()).toEqual(Object.keys(assembly.parts).sort());
    for (const part of present) {
      const family = FAMILIES[assembly.parts[part.id]!.family]!;
      expect(part.params.map((p) => p.name).sort()).toEqual(Object.keys(family.params).sort());
    }
  });

  it('lists exactly the params of every part in a generated AR', () => {
    const assembly = generate(ar, gunDomain, 7);
    const model = buildPanelModel(assembly, assembly, gunDomain, ar);
    const present = model.filter(isPresent);
    expect(present.map((p) => p.id).sort()).toEqual(Object.keys(assembly.parts).sort());
    for (const part of present) {
      const family = FAMILIES[assembly.parts[part.id]!.family]!;
      expect(part.params.map((p) => p.name).sort()).toEqual(Object.keys(family.params).sort());
    }
  });

  it('uses the loaded design template and prefab metadata in design part cards', () => {
    const text = readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-ar.json'), 'utf8');
    const loaded = loadGunDesign(text);
    if (!loaded.ok) {
      throw new Error('expected archetype-ar to load');
    }
    const { design } = loaded;
    const view = buildDesignViewModel(loaded, design.assembly.name);
    if (view.kind !== 'loaded') {
      throw new Error('expected a loaded design view');
    }
    const model = buildPanelModel(design.assembly, design.assembly, gunDomain, {
      template: ar,
      prefabsByPart: view.prefabsByPart,
    });
    const magazine = model.find((entry) => entry.id === 'magazine') as PanelPart;
    const length = magazine.params.find((param) => param.name === 'length')!;
    const sight = model.find((entry) => entry.id === 'sight') as PanelPart;
    expect(length.values.find((value) => value.value === 'M')?.permitted).toBe(true);
    expect(magazine.prefab).toEqual({
      label: 'stanag-20 v1',
      fixedParams: { length: 'M', profile: 'stanag-straight' },
      stale: false,
    });
    expect(sight.optional).toBe(true);
  });

  it("permits only the referenced part's value for a param the template copies from another slot", () => {
    // ar's handguard slot sets length: { fromSlot: 'barrel', param: 'length' }.
    const assembly = generate(ar, gunDomain, 7);
    const model = buildPanelModel(assembly, assembly, gunDomain, ar);
    const handguard = model.find((e) => e.id === 'handguard') as PanelPart;
    const barrel = model.find((e) => e.id === 'barrel') as PanelPart;
    const barrelLength = barrel.params.find((p) => p.name === 'length')!.current;
    const length = handguard.params.find((p) => p.name === 'length')!;
    expect(length.values.filter((v) => v.permitted).map((v) => v.value)).toEqual([barrelLength]);
  });

  it('marks values the current template does not permit, and leaves fixtures unmarked', () => {
    const seedAssembly = generate(battleRifle, gunDomain, 1);
    const model = buildPanelModel(seedAssembly, seedAssembly, gunDomain, battleRifle);
    const receiver = model.find((e) => e.id === 'receiver') as PanelPart;
    const bore = receiver.params.find((p) => p.name === 'bore')!;
    // battle-rifle's receiver slot only offers ['M', 'L'] for bore, though the family allows 'S' too.
    expect(bore.values.find((v) => v.value === 'S')?.permitted).toBe(false);
    expect(bore.values.find((v) => v.value === 'M')?.permitted).toBe(true);
    expect(bore.values.find((v) => v.value === 'L')?.permitted).toBe(true);

    const fixture = loadFixture('archetype-battle-rifle');
    const fixtureModel = buildPanelModel(fixture, fixture, gunDomain, undefined);
    const fixtureReceiver = fixtureModel.find((e) => e.id === 'receiver') as PanelPart;
    const fixtureBore = fixtureReceiver.params.find((p) => p.name === 'bore')!;
    expect(fixtureBore.values.every((v) => v.permitted === undefined)).toBe(true);
  });
});

describe('param panel: editing', () => {
  it('applying an override changes only that part (plus neighbours reading it via `from`)', () => {
    const seedAssembly = generate(ak, gunDomain, 3);
    const seedResolved = resolve(seedAssembly, gunDomain);
    // barrel.length isn't set by the template; find a value distinct from the seed's resolved length.
    const barrelSpec = FAMILIES.barrel!.params.length!;
    const currentLength = seedResolved.params.get('barrel')!.length!.value;
    const other = barrelSpec.values.find((v) => v !== currentLength)!;

    const { assembly: edited } = setParam(seedAssembly, gunDomain, { part: 'barrel', name: 'length' }, other);
    const editedResolved = resolve(edited, gunDomain);

    expect(editedResolved.params.get('barrel')!.length!.value).toBe(other);
    // The AK handguard inherits its length from the barrel (PROJECT.md 1.2).
    expect(editedResolved.params.get('handguard')!.length!.value).toBe(other);
    expect(editedResolved.params.get('handguard')!.length!.source).toBe('inherited');

    // Every param that ISN'T read from a neighbour (`from`) is untouched. Params that ARE
    // read from a neighbour (e.g. the AK gas-block/gas-tube's barrelLength) are allowed to
    // change; that's the "plus neighbours that inherit it via `from`" part of the proof.
    for (const [id, params] of seedResolved.params) {
      if (id === 'barrel') {
        continue;
      }
      const after = editedResolved.params.get(id)!;
      for (const [name, before] of Object.entries(params)) {
        if (after[name]!.source === 'inherited') {
          continue;
        }
        expect(after[name]!.value).toBe(before.value);
      }
    }
  });

  it('clearing an override restores the seed value', () => {
    const seedAssembly = generate(ar, gunDomain, 7);
    const gripSpec = FAMILIES.grip!.params.length!;
    const seedValue = resolve(seedAssembly, gunDomain).params.get('grip')!.length!.value;
    const other = gripSpec.values.find((v) => v !== seedValue)!;

    const { assembly: edited } = setParam(seedAssembly, gunDomain, { part: 'grip', name: 'length' }, other);
    const model = buildPanelModel(edited, seedAssembly, gunDomain, ar);
    const grip = model.find((e) => e.id === 'grip') as PanelPart;
    expect(grip.params.find((p) => p.name === 'length')!.state).toEqual({ kind: 'user' });

    const { assembly: cleared } = clearParam(edited, gunDomain, seedAssembly, { part: 'grip', name: 'length' });
    expect(resolve(cleared, gunDomain).params.get('grip')!.length!.value).toBe(seedValue);
    const clearedModel = buildPanelModel(cleared, seedAssembly, gunDomain, ar);
    const clearedGrip = clearedModel.find((e) => e.id === 'grip') as PanelPart;
    expect(clearedGrip.params.find((p) => p.name === 'length')!.state).toEqual({ kind: 'seed' });
  });

  it('round-trips overrides through the URL `set=` grammar', () => {
    const seedAssembly = generate(ak, gunDomain, 3);
    const magazineSpec = FAMILIES.magazine!.params.variant!;
    const seedVariant = resolve(seedAssembly, gunDomain).params.get('magazine')!.variant!.value;
    const otherVariant = magazineSpec.values.find((v) => v !== seedVariant)!;

    let edited = setParam(seedAssembly, gunDomain, { part: 'magazine', name: 'variant' }, otherVariant).assembly;
    edited = setSlotPresent(edited, ak, 'rear-sight', false);

    const overrides = diffOverrides(seedAssembly, edited);
    const serialized = serializeOverrides(overrides);
    expect(serialized).toContain('magazine.variant:');
    expect(serialized).toContain('rear-sight:off');

    const roundTripped = applyOverrides(seedAssembly, gunDomain, ak, parseOverrides(serialized));
    expect(roundTripped).toEqual(edited);
  });
});

describe('param panel: optional slots', () => {
  it('toggles an optional slot off (removing the part and its connections) and back on', () => {
    const seedAssembly = generate(battleRifle, gunDomain, 2);
    expect('handguard' in seedAssembly.parts).toBe(true);

    const off = setSlotPresent(seedAssembly, battleRifle, 'handguard', false);
    expect('handguard' in off.parts).toBe(false);
    expect(off.connections.some((c) => c.from.startsWith('handguard.') || c.to.startsWith('handguard.'))).toBe(false);
    expect(resolve(off, gunDomain).issues).toEqual([]);

    const backOn = setSlotPresent(off, battleRifle, 'handguard', true);
    expect(backOn.parts.handguard).toEqual({ family: 'handguard' });
    expect(resolve(backOn, gunDomain).issues).toEqual([]);
    // Reconnected to its neighbours per the template.
    expect(backOn.connections.some((c) => c.from === 'receiver.handguard' && c.to === 'handguard.rear')).toBe(true);
  });

  it('lists an absent optional slot as a not-present entry the panel can offer to add', () => {
    const seedAssembly = generate(battleRifle, gunDomain, 2);
    const off = setSlotPresent(seedAssembly, battleRifle, 'handguard', false);
    const model = buildPanelModel(off, seedAssembly, gunDomain, battleRifle);
    const slot = model.find((e) => e.id === 'handguard')!;
    expect(slot.present).toBe(false);
    expect(slot.optional).toBe(true);
    expect(slot.family).toBe('handguard');
  });
});

// A minimal, gun-agnostic test domain: `post`'s `cap` port exists only when
// its `capped` param is 'yes'. Deliberately not src/gun/parts.ts (owned by
// another agent right now) — proves the pruning is generic, not AK/AR-specific.
const testDomain: Domain = {
  name: 'test',
  families: {
    post: {
      name: 'post',
      params: {
        capped: { values: ['yes', 'no'], default: 'yes' },
        label: { values: ['a', 'b'], default: 'a' }, // unrelated to port existence
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
      params: {},
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
  units: GUN_UNITS,
};
const testSeed: Assembly = {
  name: 'post-cap',
  root: 'post',
  parts: { post: { family: 'post', params: { capped: 'yes' } }, cap: { family: 'cap' } },
  connections: [{ from: 'post.cap', to: 'cap.attach' }],
};

describe('param panel: connection pruning', () => {
  it('setting a value that drops a port prunes the connection and reports it', () => {
    const { assembly, dropped } = setParam(testSeed, testDomain, { part: 'post', name: 'capped' }, 'no');
    expect(dropped).toEqual([{ from: 'post.cap', to: 'cap.attach' }]);
    expect(assembly.connections).toEqual([]);
    // The dangling reference is gone; resolve reports the now-disconnected cap instead.
    expect(resolve(assembly, testDomain).issues).toEqual([
      { rule: 'structure', message: 'cap is not connected to the root', parts: ['cap'] },
    ]);
  });

  it('clearing the override restores the pruned connection', () => {
    const { assembly: pruned } = setParam(testSeed, testDomain, { part: 'post', name: 'capped' }, 'no');
    const { assembly: restored, dropped } = clearParam(pruned, testDomain, testSeed, { part: 'post', name: 'capped' });
    expect(dropped).toEqual([]);
    expect(restored.connections).toEqual(testSeed.connections);
    expect(restored.parts.post!.params).toEqual(testSeed.parts.post!.params);
  });

  it('an unrelated param change prunes nothing', () => {
    const { assembly, dropped } = setParam(testSeed, testDomain, { part: 'post', name: 'label' }, 'b');
    expect(dropped).toEqual([]);
    expect(assembly.connections).toEqual(testSeed.connections);
  });

  it('round-trips the pruning through the URL `set=` grammar', () => {
    const { assembly: pruned } = setParam(testSeed, testDomain, { part: 'post', name: 'capped' }, 'no');
    const overrides = diffOverrides(testSeed, pruned);
    const serialized = serializeOverrides(overrides);
    expect(serialized).toBe('post.capped:no');

    const roundTripped = applyOverrides(testSeed, testDomain, undefined, parseOverrides(serialized));
    expect(roundTripped).toEqual(pruned);
  });
});
