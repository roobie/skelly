import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { localSolidBounds } from '../src/core/geometry.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, FIRING_GRIP } from '../src/gun/parts.ts';
import { pumpShotgun } from '../src/gun/templates.ts';

const SEEDS = Array.from({ length: 100 }, (_, seed) => seed);
// Coverage of generate + validate + anchors saturates well before seed 40 for every template, so
// the validated loop stops there; the cheap generate-only layout share check keeps all 100 seeds.
const VALIDATED_SEEDS = SEEDS.slice(0, 40);

describe('pump shotgun variants', () => {
  it('picks the pistol-grip lower layout for 20-40% of seeds and the gripless one otherwise', () => {
    const counts = { pump: 0, trigger: 0 };
    for (const seed of SEEDS) {
      const layout = generate(pumpShotgun, gunDomain, seed).parts.lower?.params?.layout;
      expect(['pump', 'trigger'], `seed ${seed}: lower layout`).toContain(layout);
      counts[layout as keyof typeof counts] += 1;
    }

    expect(counts.trigger / SEEDS.length).toBeGreaterThanOrEqual(0.2);
    expect(counts.trigger / SEEDS.length).toBeLessThanOrEqual(0.4);
    expect(counts.pump + counts.trigger).toBe(SEEDS.length);
  });

  // Generates and validates the selected seed sample for pump variants.
  it('generates valid gripless and pistol-grip builds with exactly one hold', { timeout: 25_000 }, () => {
    for (const seed of VALIDATED_SEEDS) {
      const assembly = generate(pumpShotgun, gunDomain, seed);
      const layout = assembly.parts.lower?.params?.layout;

      const report = validate(assembly, gunDomain);
      expect(report.ok, `seed ${seed}: ${JSON.stringify(report.issues)}`).toBe(true);
      const barrelLength = assembly.parts.barrel?.params?.length;
      expect(['S', 'M', 'L'], `seed ${seed}: barrel length`).toContain(barrelLength);
      const tubeDef = report.resolved.defs.get('tube');
      const tubeSolid = tubeDef?.solids.find((solid) => solid.id === 'tube');
      const tubeCap = tubeDef?.ports.find((port) => port.id === 'cap');
      if (tubeSolid?.kind !== 'extruded-polygon' || !tubeCap) {
        throw new Error(`seed ${seed}: octagonal pump tube or cap is missing`);
      }
      expect(tubeSolid.profile).toHaveLength(8);
      const [, tubeMax] = localSolidBounds(tubeSolid);
      const [tubeBodyEnd] = tubeMax;
      const [tubeEnd] = tubeCap.pos;
      const lengthPercent = assembly.parts.tube?.params?.lengthPercent;
      expect(['50', '75', '100'], `seed ${seed}: tube length percentage`).toContain(lengthPercent);
      const expectedTubeEnd = {
        S: { '50': 13, '75': 19.5, '100': 26 },
        M: { '50': 18, '75': 27, '100': 36 },
        L: { '50': 23, '75': 34.5, '100': 46 },
      }[barrelLength as 'S' | 'M' | 'L'][lengthPercent as '50' | '75' | '100'];
      expect(tubeEnd, `seed ${seed}: ${lengthPercent}% tube on ${barrelLength} barrel`).toBe(expectedTubeEnd);
      expect(tubeBodyEnd, `seed ${seed}: tube body enters the cap`).toBe(expectedTubeEnd - 0.5);
      expect(assembly.connections).toContainEqual({ from: 'tube.cap', to: 'barrel.lug' });
      expect(assembly.connections.some(({ from, to }) => from === 'tube.support' && to === 'barrel.support-lug')).toBe(
        lengthPercent !== '50',
      );
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
  });

  it('never gives the g8 pump lower layout a grip port', () => {
    const lower = FAMILIES.lower!.build({ layout: 'pump' });
    expect(lower.ports.some(({ id }) => id === 'grip')).toBe(false);
  });
});
