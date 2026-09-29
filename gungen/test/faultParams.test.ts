import { describe, expect, it } from 'vitest';
import type { ParamReference, Template } from '../src/core/template.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { TEMPLATES } from '../src/gun/templates.ts';
import { buildPanelModel } from '../src/viewer/paramPanel.ts';
import { loadFixture, loadFixtures } from './helpers.ts';

const faultTable = {
  handguard: { fit: ['oversized', 'too-tight'] },
  cylinder: { chamber: ['misaligned'] },
  lower: { triggerGuard: ['missing'] },
  frame: { triggerGuard: ['missing'] },
} as const;

type FaultTable = typeof faultTable;
const paramSpec = (family: keyof FaultTable, name: string) =>
  FAMILIES[family]!.params[name] as { fault?: readonly string[] };

const valuesFor = (template: Template, slotId: string, name: string, seen = new Set<string>()): readonly string[] => {
  const key = `${slotId}.${name}`;
  if (seen.has(key)) {
    return [];
  }
  seen.add(key);
  const slot = template.slots.find((candidate) => candidate.id === slotId);
  const value = slot?.params?.[name];
  if (value === undefined) {
    const spec = slot && gunDomain.families[slot.family]?.params[name];
    return spec ? [spec.default] : [];
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value;
  }
  const ref = value as ParamReference;
  return valuesFor(template, ref.fromSlot, ref.param, seen);
};

describe('fault-only parameter values', () => {
  it('marks every fixture-only value as fault metadata', () => {
    for (const [family, params] of Object.entries(faultTable) as [keyof FaultTable, FaultTable[keyof FaultTable]][]) {
      for (const [name, values] of Object.entries(params)) {
        expect(paramSpec(family, name).fault).toEqual(values);
      }
    }
  });

  it('no template can choose a fault value, directly or through a ParamReference', () => {
    for (const template of TEMPLATES) {
      for (const slot of template.slots) {
        const family = gunDomain.families[slot.family]!;
        for (const [name, spec] of Object.entries(family.params)) {
          const fault = (spec as { fault?: readonly string[] }).fault ?? [];
          expect(
            valuesFor(template, slot.id, name).filter((value) => fault.includes(value)),
            `${template.name}.${slot.id}.${name}`,
          ).toEqual([]);
        }
      }
    }
  });

  it('no archetype fixture uses a fault value', () => {
    for (const fixture of loadFixtures().filter((candidate) => candidate.name.startsWith('archetype-'))) {
      for (const [id, part] of Object.entries(fixture.parts)) {
        const specs = gunDomain.families[part.family]!.params;
        for (const [name, value] of Object.entries(part.params ?? {})) {
          expect(
            (specs[name] as { fault?: readonly string[] } | undefined)?.fault ?? [],
            `${fixture.name}.${id}.${name}`,
          ).not.toContain(value);
        }
      }
    }
  });

  it('hides fault values from panel choices but keeps a fixture current value visible', () => {
    const assembly = loadFixture('broken-handguard-fit');
    const panel = buildPanelModel(assembly, assembly, gunDomain, undefined);
    const handguard = panel.find((entry) => entry.id === 'handguard');
    expect(handguard?.present).toBe(true);
    if (handguard?.present) {
      const fit = handguard.params.find((param) => param.name === 'fit');
      expect(fit).toBeDefined();
      if (!fit) {
        return;
      }
      expect(fit.current).toBe('oversized');
      expect(faultTable.handguard.fit.some((fault) => fit.values.some(({ value }) => value === fault))).toBe(false);
    }
  });

  it('keeps every fault-using broken fixture valid against its unchanged expect list', () => {
    const names = [
      'broken-free-float-handguard',
      'broken-handguard-fit',
      'broken-keep-out',
      'broken-solid-overlap',
      'broken-revolver-misaligned-cylinder',
      'broken-trigger-guard',
    ];
    for (const name of names) {
      const fixture = loadFixture(name);
      const failed = [...new Set(validate(fixture, gunDomain).issues.map(({ rule }) => rule))].sort();
      expect(failed, name).toEqual([...(fixture.expect ?? [])].sort());
    }
  });
});
