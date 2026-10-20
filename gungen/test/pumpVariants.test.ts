import { generate } from '@skelly/engine/assembly/generate.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { localSolidBounds } from '@skelly/engine/shapes/geometry.ts';
import { describe, expect, it } from 'vitest';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FIRING_GRIP } from '../src/gun/parts.ts';
import { pumpShotgun } from '../src/gun/templates.ts';

const SEEDS = Array.from({ length: 100 }, (_, seed) => seed);
// Coverage of generate + validate + anchors saturates well before seed 40 for every template, so
// the validated loop stops there; the cheap generate-only layout check keeps all 100 seeds.
const VALIDATED_SEEDS = SEEDS.slice(0, 40);

const check = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

// Validates the shared tube, anchor and layout contract for one generated build, recording the cap
// end so the caller can assert its growth relations.
const recordPumpVariant = (
  assembly: ReturnType<typeof generate>,
  report: ReturnType<typeof validate>,
  seed: number,
  tubeEnds: Map<string, Map<string, number>>,
) => {
  const layout = assembly.parts.lower?.params?.layout;
  const barrelLength = assembly.parts.barrel?.params?.length;
  check(layout === 'pump' || layout === 'trigger', `seed ${seed}: lower layout`);
  check(barrelLength === 'S' || barrelLength === 'M' || barrelLength === 'L', `seed ${seed}: barrel length`);
  const tubeDef = report.resolved.defs.get('tube');
  const tubeSolid = tubeDef?.solids.find((solid) => solid.id === 'tube');
  const tubeCap = tubeDef?.ports.find((port) => port.id === 'cap');
  if (tubeSolid?.kind !== 'extruded-polygon' || !tubeCap) {
    throw new Error(`seed ${seed}: octagonal pump tube or cap is missing`);
  }
  check(tubeSolid.profile.length === 8, `seed ${seed}: octagonal tube profile`);
  const [, tubeMax] = localSolidBounds(tubeSolid);
  const [tubeBodyEnd] = tubeMax;
  const [tubeEnd] = tubeCap.pos;
  const lengthPercent = assembly.parts.tube?.params?.lengthPercent;
  check(
    lengthPercent === '50' || lengthPercent === '75' || lengthPercent === '100',
    `seed ${seed}: tube length percentage`,
  );
  check(tubeBodyEnd < tubeEnd, `seed ${seed}: tube body enters the cap`);
  check(
    assembly.connections.some(({ from, to }) => from === 'tube.cap' && to === 'barrel.lug'),
    `seed ${seed}: cap meets the lug`,
  );
  check(
    assembly.connections.some(({ from, to }) => from === 'tube.support' && to === 'barrel.support-lug') ===
      (lengthPercent !== '50'),
    `seed ${seed}: support lug present iff not 50%`,
  );
  const endsForBarrel = tubeEnds.get(barrelLength!) ?? new Map<string, number>();
  endsForBarrel.set(lengthPercent!, tubeEnd);
  tubeEnds.set(barrelLength!, endsForBarrel);
  const hold = selectGunAnchors(report.resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
  check(!('code' in hold), `seed ${seed}: one unambiguous hold`);

  const stockId = Object.keys(assembly.parts).find((id) => assembly.parts[id]?.family === 'stock');
  check(stockId !== undefined, `seed ${seed}: one stock part`);
  const stock = assembly.parts[stockId!]!;
  if (layout === 'pump') {
    check(assembly.parts.grip === undefined, `seed ${seed}: stock-grip variant`);
    check(
      stock.params?.style === 'tapered' || stock.params?.style === 'tapered-sawed',
      `seed ${seed}: tapered firing stock`,
    );
    check(stock.params?.length === 'M' || stock.params?.length === 'L', `seed ${seed}: stock length`);
    check(
      report.resolved.defs.get(stockId!)?.tags?.includes(FIRING_GRIP) === true,
      `seed ${seed}: stock is the firing grip`,
    );
  } else {
    check(assembly.parts.grip !== undefined, `seed ${seed}: separate pistol grip`);
    check(
      assembly.connections.some(({ from, to }) => from === 'lower.grip' && to === 'grip.top'),
      `seed ${seed}: grip connection`,
    );
    check(stock.params?.style === 'straight', `seed ${seed}: stock needs the pistol grip`);
  }
};

// Checks the cap end grows with tube percentage (same barrel) and with barrel length (same
// percentage), returning how many relations were actually exercised.
const countTubeEndGrowth = (tubeEnds: Map<string, Map<string, number>>): number => {
  let growth = 0;
  const percentOrder = ['50', '75', '100'];
  for (const ends of tubeEnds.values()) {
    const ordered = percentOrder
      .filter((percent) => ends.has(percent))
      .map((percent) => [percent, ends.get(percent)!] as const);
    for (let index = 1; index < ordered.length; index++) {
      check(ordered[index]![1] > ordered[index - 1]![1], `${ordered[index - 1]![0]}% -> ${ordered[index]![0]}%`);
      growth += 1;
    }
  }
  for (const percent of percentOrder) {
    const ordered = (['S', 'M', 'L'] as const)
      .filter((barrel) => tubeEnds.get(barrel)?.has(percent))
      .map((barrel) => [barrel, tubeEnds.get(barrel)!.get(percent)!] as const);
    for (let index = 1; index < ordered.length; index++) {
      check(
        ordered[index]![1] > ordered[index - 1]![1],
        `${ordered[index - 1]![0]} -> ${ordered[index]![0]} at ${percent}%`,
      );
      growth += 1;
    }
  }
  return growth;
};

describe('pump shotgun variants', () => {
  it('picks both the pistol-grip and the gripless lower layout across seeds', () => {
    const layouts = new Set<string>();
    for (const seed of SEEDS) {
      const layout = generate(pumpShotgun, gunDomain, seed).parts.lower?.params?.layout;
      expect(['pump', 'trigger'], `seed ${seed}: lower layout`).toContain(layout);
      layouts.add(layout!);
    }
    expect([...layouts].sort()).toEqual(['pump', 'trigger']);
  });

  // Generates and validates the selected seed sample for pump variants.
  it('generates valid gripless and pistol-grip builds with exactly one hold', { timeout: 25_000 }, () => {
    const layouts = new Set<string>();
    const tubeEnds = new Map<string, Map<string, number>>();
    for (const seed of VALIDATED_SEEDS) {
      const assembly = generate(pumpShotgun, gunDomain, seed);
      layouts.add(assembly.parts.lower?.params?.layout ?? '');
      const report = validate(assembly, gunDomain);
      expect(report.ok, `seed ${seed}: ${JSON.stringify(report.issues)}`).toBe(true);
      recordPumpVariant(assembly, report, seed, tubeEnds);
    }
    expect([...layouts].sort()).toEqual(['pump', 'trigger']);
    expect(countTubeEndGrowth(tubeEnds)).toBeGreaterThan(0);
  });
});
