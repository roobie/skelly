// Fail-first proof for the parameter panel's pure logic (item
// gungen5-param-panel). No DOM or three.js: everything here works on plain
// Assembly objects, the same as resolve()/validate() do.

import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { resolve } from '../src/core/resolve.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { ak, ar, battleRifle } from '../src/gun/templates.ts';
import {
  applyOverrides,
  buildPanelModel,
  clearParam,
  diffOverrides,
  type PanelPart,
  parseOverrides,
  serializeOverrides,
  setParam,
  setSlotPresent,
} from '../src/viewer/paramPanel.ts';
import { loadFixture } from './helpers.ts';

const isPresent = (entry: { present: boolean }): entry is PanelPart => entry.present;

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

    const edited = setParam(seedAssembly, 'barrel', 'length', other);
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

    const edited = setParam(seedAssembly, 'grip', 'length', other);
    const model = buildPanelModel(edited, seedAssembly, gunDomain, ar);
    const grip = model.find((e) => e.id === 'grip') as PanelPart;
    expect(grip.params.find((p) => p.name === 'length')!.state).toEqual({ kind: 'user' });

    const cleared = clearParam(edited, seedAssembly, 'grip', 'length');
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

    let edited = setParam(seedAssembly, 'magazine', 'variant', otherVariant);
    edited = setSlotPresent(edited, ak, 'rear-sight', false);

    const overrides = diffOverrides(seedAssembly, edited);
    const serialized = serializeOverrides(overrides);
    expect(serialized).toContain('magazine.variant:');
    expect(serialized).toContain('rear-sight:off');

    const roundTripped = applyOverrides(seedAssembly, ak, parseOverrides(serialized));
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
