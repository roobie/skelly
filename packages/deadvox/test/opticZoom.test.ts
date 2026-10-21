import { describe, expect, it } from 'vitest';
import type { Item } from '../src/core/items.ts';
import type { ItemDef, ModelDef } from '../src/core/schema.ts';
import { OpticZoom } from '../src/game/opticZoom.ts';

const fixture = (rememberPerWeapon = true, fixed = false) => {
  const range = { min: 2, max: fixed ? 2 : 7.3 };
  const initial = fixed ? range.min : 4;
  const tuning = { step: 0.7, rememberPerWeapon };
  const optic: ItemDef = {
    id: 'fixture_optic',
    name: 'Fixture optic',
    category: 'misc',
    economy: { usage: [], tiers: [] },
    weight: 1,
    size: [1, 1],
    model: 'fixture_optic_model',
    ...(fixed ? {} : { opticMagnification: initial, opticZoom: tuning }),
  };
  const model: ModelDef = {
    id: 'fixture_optic_model',
    file: 'fixture.glb',
    gun: {
      attachment: {
        id: 'fixture_optic',
        kind: 'optic',
        mount: 'rail-top',
        mountFrame: { normal: [0, -1, 0], up: [1, 0, 0] },
        properties: { magnification: range },
      },
    },
  };
  const registry = { items: new Map([[optic.id, optic]]), models: new Map([[model.id, model]]) };
  let nextUid = 0;
  const item = (type: string): Item => {
    nextUid += 1;
    return { uid: nextUid, type, count: 1, condition: 1 };
  };
  const weapon = (): Item => ({ ...item('fixture_weapon'), slots: { sight: item(optic.id) } });
  return { zoom: new OpticZoom(registry), weapon, range, initial, tuning, registry };
};

describe('optic wheel zoom', () => {
  it('steps within the exported range and owns the wheel even at its endpoints', () => {
    const { zoom, weapon, range, initial, tuning } = fixture();
    const gun = weapon();
    const before = structuredClone(gun);
    expect(zoom.wheel(gun, true, -1)).toBe(true);
    expect(zoom.frame(gun, true)?.magnification).toBeCloseTo(initial + tuning.step);
    const steps = Math.ceil((range.max - range.min) / tuning.step) + 1;
    for (const delta of [-1, 1]) {
      for (let index = 0; index < steps; index++) {
        expect(zoom.wheel(gun, true, delta)).toBe(true);
        const power = zoom.frame(gun, true)!.magnification;
        expect(power).toBeGreaterThanOrEqual(range.min);
        expect(power).toBeLessThanOrEqual(range.max);
      }
      expect(zoom.frame(gun, true)?.magnification).toBe(delta < 0 ? range.max : range.min);
    }
    expect(gun).toEqual(before);
  });

  it('does not take the wheel outside ADS or without an optic', () => {
    const { zoom, weapon } = fixture();
    const gun = weapon();
    expect(zoom.wheel(gun, true, -1)).toBe(true);
    const aimed = zoom.frame(gun, true)!.magnification;
    expect(zoom.wheel(gun, false, -1)).toBe(false);
    expect(zoom.frame(gun, true)!.magnification).toBe(aimed);
    expect(zoom.frame(gun, false)).toBeUndefined();
    expect(zoom.wheel(undefined, true, -1)).toBe(false);
    const bare: Item = { uid: 100, type: 'fixture_bare_weapon', count: 1, condition: 1 };
    expect(zoom.wheel(bare, true, -1)).toBe(false);
  });

  it('does not take the wheel through a fixed optic', () => {
    const { zoom, weapon } = fixture(true, true);
    expect(zoom.wheel(weapon(), true, -1)).toBe(false);
  });

  it.each([false, true])('applies content per-weapon session memory (%s)', (remember) => {
    const { zoom, weapon, initial, registry } = fixture(remember);
    const first = weapon();
    const second = weapon();
    expect(zoom.wheel(first, true, -1)).toBe(true);
    const selected = zoom.frame(first, true)!.magnification;
    expect(selected).not.toBe(initial);
    expect(zoom.frame(second, true)?.magnification).toBe(initial);
    expect(zoom.frame(first, true)?.magnification).toBe(remember ? selected : initial);
    zoom.frame(first, false);
    expect(zoom.frame(first, true)?.magnification).toBe(remember ? selected : initial);
    expect(new OpticZoom(registry).frame(first, true)?.magnification).toBe(initial);
  });
});
