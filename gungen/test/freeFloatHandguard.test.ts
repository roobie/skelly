import { generate } from '@skelly/engine/assembly/generate.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { describe, expect, it } from 'vitest';
import { gunDomain } from '../src/gun/domain.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { loadFixture, variant } from './helpers.ts';
import { sweepGroup } from './sweeps.ts';

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

const byName = (name: string) => TEMPLATES.find((template) => template.name === name)!;

const check = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

// Measures the free-float share of a template's generated handguards against the mount choices
// the template declares, proving both mounts occur and that free-float builds drop the barrel clamp.
const freeFloatFraction = (name: string, count = 500) => {
  const template = byName(name);
  const mount = template.slots.find((slot) => slot.family === 'handguard')?.params?.mount;
  const choices = Array.isArray(mount) ? mount : [mount];
  const declared = choices.filter((choice) => choice === 'free-float').length / choices.length;
  let freeFloatCount = 0;
  let presentCount = 0;
  let sawClamped = false;
  for (let seed = 0; seed < count; seed++) {
    const {
      parts: { handguard, barrel },
      connections,
    } = generate(template, gunDomain, seed);
    if (handguard) {
      presentCount += 1;
    }
    if (handguard?.params?.mount === 'free-float') {
      freeFloatCount += 1;
      check(
        handguard.params.length === barrel?.params?.length,
        `${name} seed ${seed}: free-float length follows the barrel`,
      );
      check(
        !connections.some(({ from, to }) => from === 'handguard.front' && to === 'barrel.clamp'),
        `${name} seed ${seed}: free-float drops the barrel clamp`,
      );
    } else if (handguard?.params?.mount === 'clamped') {
      sawClamped = true;
    }
  }
  return { fraction: freeFloatCount / presentCount, declared, sawClamped, sawFreeFloat: freeFloatCount > 0 };
};

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

  sweepGroup('chooses mounts by template data and keeps other families clamped', () => {
    it('passes', () => {
      const arFraction = freeFloatFraction('ar');
      expect(arFraction.fraction, 'AR free-float share follows the template choices').toBeCloseTo(
        arFraction.declared,
        1,
      );
      expect(arFraction.sawFreeFloat).toBe(true);
      expect(arFraction.sawClamped).toBe(true);
      const battleRifleFraction = freeFloatFraction('battle-rifle');
      expect(battleRifleFraction.fraction, 'battle-rifle free-float share follows the template choices').toBeCloseTo(
        battleRifleFraction.declared,
        1,
      );
      expect(battleRifleFraction.sawFreeFloat).toBe(true);
      expect(battleRifleFraction.sawClamped).toBe(true);
      for (const name of ['ak', 'smg', 'bolt-rifle-box']) {
        for (let seed = 0; seed < 20; seed++) {
          const { handguard } = generate(byName(name), gunDomain, seed).parts;
          expect(handguard?.params?.mount ?? 'clamped').toBe('clamped');
        }
      }
    });
  });

  it('reports a free-float barrel-contact violation when clearance is removed', () => {
    const report = validate(freeFloat('M', 'M', 'too-tight'), gunDomain);
    expect(report.issues.some(({ rule }) => rule === 'free-float-clearance')).toBe(true);
  });
});
