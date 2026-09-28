import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { loadFixture, variant } from './helpers.ts';

const freeFloat = (barrelLength: string, handguardLength: string, fit = 'receiver') =>
  variant('archetype-ar', (draft) => {
    draft.parts.handguard!.params = {
      ...draft.parts.handguard!.params,
      mount: 'free-float',
      length: handguardLength,
      fit,
    };
    draft.parts.barrel!.params!.length = barrelLength;
    draft.parts = Object.fromEntries(Object.entries(draft.parts).filter(([part]) => part !== 'sight'));
    draft.connections = draft.connections.filter(
      ({ from, to }) => (from !== 'handguard.front' || to !== 'barrel.clamp') && to !== 'sight.base',
    );
  });

const clampConnection = (assembly: ReturnType<typeof freeFloat>) =>
  assembly.connections.some(({ from, to }) => from === 'handguard.front' && to === 'barrel.clamp');

describe('free-floating handguards', () => {
  it('hangs from the receiver without a barrel clamp and keeps its own length when the barrel changes', () => {
    for (const barrelLength of ['S', 'M', 'L']) {
      const assembly = freeFloat(barrelLength, barrelLength);
      const report = validate(assembly, gunDomain);
      expect(report.ok, `${barrelLength} barrel`).toBe(true);
      expect(clampConnection(assembly)).toBe(false);
      expect(report.resolved.defs.get('handguard')!.ports.some(({ id }) => id === 'front')).toBe(false);
      expect(report.resolved.params.get('handguard')?.length?.value).toBe(barrelLength);
      expect(report.resolved.params.get('barrel')?.length?.value).toBe(barrelLength);
    }
    const changedBarrel = validate(freeFloat('L', 'M'), gunDomain);
    expect(changedBarrel.ok).toBe(true);
    expect(changedBarrel.resolved.params.get('handguard')?.length?.value).toBe('M');
  });

  it('keeps the clamped mount and front connection as the default', () => {
    const assembly = loadFixture('archetype-ar');
    const report = validate(assembly, gunDomain);
    expect(report.ok).toBe(true);
    expect(report.resolved.params.get('handguard')?.mount?.value).toBe('clamped');
    expect(report.resolved.defs.get('handguard')!.ports.some(({ id }) => id === 'front')).toBe(true);
    expect(assembly.connections.some(({ from, to }) => from === 'handguard.front' && to === 'barrel.clamp')).toBe(true);
  });

  it('chooses mounts by template data and keeps other families clamped', () => {
    const byName = (name: string) => TEMPLATES.find((template) => template.name === name)!;
    const freeFloatFraction = (name: string, count = 500) => {
      let freeFloatCount = 0;
      let presentCount = 0;
      for (let seed = 0; seed < count; seed++) {
        const {
          parts: { handguard, barrel },
          connections,
        } = generate(byName(name), gunDomain, seed);
        if (handguard) {
          presentCount += 1;
        }
        if (handguard?.params?.mount === 'free-float') {
          freeFloatCount += 1;
          expect(handguard.params.length).toBe(barrel?.params?.length);
          expect(connections.some(({ from, to }) => from === 'handguard.front' && to === 'barrel.clamp')).toBe(false);
        }
      }
      return freeFloatCount / presentCount;
    };
    expect(freeFloatFraction('ar')).toBeGreaterThanOrEqual(0.7);
    expect(freeFloatFraction('ar')).toBeLessThanOrEqual(0.8);
    expect(freeFloatFraction('battle-rifle')).toBeGreaterThanOrEqual(0.45);
    expect(freeFloatFraction('battle-rifle')).toBeLessThanOrEqual(0.55);
    for (const name of ['ak', 'smg', 'bolt-rifle-box']) {
      for (let seed = 0; seed < 20; seed++) {
        const { handguard } = generate(byName(name), gunDomain, seed).parts;
        expect(handguard?.params?.mount ?? 'clamped').toBe('clamped');
      }
    }
  });

  it('reports a free-float barrel-contact violation when clearance is removed', () => {
    const report = validate(freeFloat('M', 'M', 'too-tight'), gunDomain);
    expect(report.issues.some(({ rule }) => rule === 'free-float-clearance')).toBe(true);
  });
});
