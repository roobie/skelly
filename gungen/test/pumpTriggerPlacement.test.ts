import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { pumpShotgun } from '../src/gun/templates.ts';

const ROOT = join(import.meta.dirname, '..');
const pumpDesign = (
  JSON.parse(readFileSync(join(ROOT, 'designs', 'archetype-pump-shotgun.json'), 'utf8')) as {
    assembly: Assembly;
  }
).assembly;
const samples = [
  { assembly: pumpDesign, label: 'archetype-pump-shotgun design' },
  { assembly: generate(pumpShotgun, gunDomain, 0), label: 'pump-shotgun seed 0' },
  { assembly: generate(pumpShotgun, gunDomain, 1), label: 'pump-shotgun seed 1' },
];
const BEFORE_TRIGGER_CENTER_X = -10.5;

const lowerAndTriggerCenterX = (assembly: Assembly): { lowerId: string; centerX: number } => {
  const resolved = resolve(assembly, gunDomain);
  const lowerId = Object.keys(assembly.parts).find((id) => assembly.parts[id]?.family === 'lower')!;
  const lower = resolved.defs.get(lowerId)!;
  const transform = resolved.placed.get(lowerId)!;
  const finger = lower.keepOuts.find(({ id }) => id === 'trigger-finger')!;
  return { lowerId, centerX: applyPoint(transform, finger.box.center)[0] };
};

describe('pump trigger placement', () => {
  it('moves the trigger centre rearward by 1–2u and keeps the guard valid', () => {
    for (const { assembly, label } of samples) {
      const { centerX } = lowerAndTriggerCenterX(assembly);
      const rearwardShift = BEFORE_TRIGGER_CENTER_X - centerX;
      const report = validate(assembly, gunDomain);
      const triggerIssues = report.issues.filter(({ rule }) => rule === 'trigger-guard');

      expect(rearwardShift, `${label}: trigger centre X=${centerX}`).toBeGreaterThanOrEqual(1);
      expect(rearwardShift, `${label}: trigger centre X=${centerX}`).toBeLessThanOrEqual(2);
      expect(assembly.parts.grip, `${label}: pump uses its stock as the firing grip`).toBeUndefined();
      expect(triggerIssues, `${label}: trigger guard encloses its volume`).toEqual([]);
      expect(report.ok, `${label}: all rules`).toBe(true);
    }
  });

  it('removes the pump lower grip port and rejects a pump assembly with a separate grip', () => {
    const { lowerId } = lowerAndTriggerCenterX(pumpDesign);
    const resolved = resolve(pumpDesign, gunDomain);
    const lower = resolved.defs.get(lowerId)!;
    expect(lower.ports.some(({ id }) => id === 'grip')).toBe(false);

    const withGrip: Assembly = {
      ...pumpDesign,
      parts: { ...pumpDesign.parts, grip: { family: 'grip', params: { length: 'M' } } },
      connections: [...pumpDesign.connections, { from: `${lowerId}.grip`, to: 'grip.top' }],
    };
    const rejected = validate(withGrip, gunDomain);
    expect(rejected.ok).toBe(false);
    expect(
      rejected.issues.some(
        ({ rule, message }) => rule === 'structure' && message.includes('lower" (lower) has no port "grip"'),
      ),
    ).toBe(true);
  });
});
