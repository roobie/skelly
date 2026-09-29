import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, FIRING_GRIP } from '../src/gun/parts.ts';
import { pumpShotgun } from '../src/gun/templates.ts';

const SEEDS = Array.from({ length: 100 }, (_, seed) => seed);

describe('pump shotgun grip variants', () => {
  it('generates valid gripless and pistol-grip builds with exactly one hold', () => {
    const counts = { pump: 0, trigger: 0 };
    for (const seed of SEEDS) {
      const assembly = generate(pumpShotgun, gunDomain, seed);
      const layout = assembly.parts.lower?.params?.layout;
      expect(['pump', 'trigger'], `seed ${seed}: lower layout`).toContain(layout);
      counts[layout as keyof typeof counts] += 1;

      const report = validate(assembly, gunDomain);
      expect(report.ok, `seed ${seed}: ${JSON.stringify(report.issues)}`).toBe(true);
      const hold = selectGunAnchors(report.resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
      expect('code' in hold, `seed ${seed}: one unambiguous hold`).toBe(false);

      const stockId = Object.keys(assembly.parts).find((id) => assembly.parts[id]?.family === 'stock')!;
      const stock = assembly.parts[stockId]!;
      if (layout === 'pump') {
        expect(assembly.parts.grip, `seed ${seed}: stock-grip variant`).toBeUndefined();
        expect(report.resolved.defs.get('lower')?.ports.some(({ id }) => id === 'grip')).toBe(false);
        expect(['tapered', 'tapered-sawed'], `seed ${seed}: tapered firing stock`).toContain(stock.params?.style);
        expect(['M', 'L'], `seed ${seed}: stock length`).toContain(stock.params?.length);
        expect(report.resolved.defs.get(stockId)?.tags).toContain(FIRING_GRIP);
      } else {
        expect(assembly.parts.grip, `seed ${seed}: separate pistol grip`).toBeDefined();
        expect(assembly.connections).toContainEqual({ from: 'lower.grip', to: 'grip.top' });
        expect(stock?.params?.style, `seed ${seed}: stock needs the pistol grip`).toBe('straight');
      }
    }

    expect(counts.trigger / SEEDS.length).toBeGreaterThanOrEqual(0.2);
    expect(counts.trigger / SEEDS.length).toBeLessThanOrEqual(0.4);
    expect(counts.pump + counts.trigger).toBe(SEEDS.length);
  });

  it('never gives the g8 pump lower layout a grip port', () => {
    const lower = FAMILIES.lower!.build({ layout: 'pump' });
    expect(lower.ports.some(({ id }) => id === 'grip')).toBe(false);
  });
});
