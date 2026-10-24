import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from '@skelly/engine/assembly/generate.ts';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly } from '@skelly/engine/assembly/schema.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { applyPoint } from '@skelly/engine/foundation/math.ts';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { pumpShotgun } from '../src/gun/templates.ts';

const ROOT = join(import.meta.dirname, '..');
// The authored design names catalogue items, so only the loader expands it into an assembly.
const loadedPump = loadGunDesign(readFileSync(join(ROOT, 'designs', 'archetype-pump-shotgun.json'), 'utf8'));
if (!loadedPump.ok) {
  throw new Error(loadedPump.error.message);
}
const pumpDesign: Assembly = loadedPump.design.assembly;
const samples = [
  { assembly: pumpDesign, label: 'archetype-pump-shotgun design' },
  { assembly: generate(pumpShotgun, gunDomain, 0), label: 'pump-shotgun seed 0' },
  { assembly: generate(pumpShotgun, gunDomain, 1), label: 'pump-shotgun seed 1' },
];

describe('pump trigger placement', () => {
  const lowerAndTriggerCenterX = (assembly: Assembly): { lowerId: string; centerX: number } => {
    const resolved = resolve(assembly, gunDomain);
    const lowerId = Object.keys(assembly.parts).find((id) => assembly.parts[id]?.family === 'lower')!;
    const lower = resolved.defs.get(lowerId)!;
    const transform = resolved.placed.get(lowerId)!;
    const finger = lower.keepOuts.find(({ id }) => id === 'trigger-finger')!;
    return { lowerId, centerX: applyPoint(transform, finger.box.center)[0] };
  };

  it('places the pump trigger rearward of the trigger-layout lower and keeps the guard valid', () => {
    const triggerCentreXForLayout = (layout: 'pump' | 'trigger') =>
      lowerAndTriggerCenterX({
        name: 'lower probe',
        root: 'lower',
        parts: { lower: { family: 'lower', params: { layout } } },
        connections: [],
      }).centerX;
    expect(triggerCentreXForLayout('pump')).toBeLessThan(triggerCentreXForLayout('trigger'));

    for (const { assembly, label } of samples) {
      const report = validate(assembly, gunDomain);
      const triggerIssues = report.issues.filter(({ rule }) => rule === 'trigger-guard');
      expect(assembly.parts.grip, `${label}: pump uses its stock as the firing grip`).toBeUndefined();
      expect(triggerIssues, `${label}: trigger guard encloses its volume`).toEqual([]);
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
