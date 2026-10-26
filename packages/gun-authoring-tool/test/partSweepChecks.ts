import type { PartFamily } from '@skelly/engine/assembly/schema.ts';
import { GRID } from '@skelly/engine/foundation/conventions.ts';
import { cross, dot, length } from '@skelly/engine/foundation/math.ts';
import { expect, it } from 'vitest';
import { BOLT_CARRIER_RUNNING_CLEARANCE_U } from '../src/gun/parts.ts';

const onGrid = (n: number, step = GRID) => Math.abs(n / step - Math.round(n / step)) < 1e-9;

const onGridWithCarrierClearance = (value: number, step: number, family: PartFamily): boolean => {
  if (onGrid(value, step)) {
    return true;
  }
  // Receiver cavities and the SMG handle stem in its slot stand one running clearance off the grid.
  if (family.name !== 'receiver' && family.name !== 'smg-handle') {
    return false;
  }
  const nearest = Math.round(value / step) * step;
  return Math.abs(Math.abs(value - nearest) - BOLT_CARRIER_RUNNING_CLEARANCE_U) < 1e-9;
};

// Each case checks only the PartDef that `build(params)` returns: grid alignment, orthonormal
// ports, unique port ids and positive box sizes. No rules or geometry checks run.

export const definePartChecks = (family: PartFamily, cases: Record<string, string>[], batchSize = 1): void => {
  let gridStep = GRID;
  if (family.name === 'forend' || family.name === 'ar-charging-handle') {
    gridStep = GRID / 5;
  } else if (['front-sight', 'rail-front-sight', 'ak-rear-sight', 'sporting-rear-sight'].includes(family.name)) {
    gridStep = GRID / 4;
  } else if (['frame', 'slide'].includes(family.name)) {
    gridStep = GRID / 2;
  }
  const check = (params: Record<string, string>) => {
    const def = family.build(params);
    const bounds = (box: { center: readonly number[]; half: readonly number[] }) =>
      box.center.flatMap((center, axis) => [center - box.half[axis]!, center + box.half[axis]!]);
    // Guard geometry preserves the pistol golden and exact contact with angled grips; it has its own geometry tests.
    // Explicit metal handle parts use sub-grid clearances; their ownership, contact and motion have dedicated geometry tests.
    const explicitCarrierStyle = family.name === 'bolt-carrier' && params.handleStyle !== undefined;
    // AR hand corridors follow the thin, 0.05u-authored handle; body stations retain their usual grid.
    const fineHandleIds = new Set(['charging-handle', 'rear-t-hand-grip-clearance', 'rear-t-hand-clearance']);
    const fineHandleKeepOuts = def.keepOuts.filter((k) => family.name === 'receiver' && fineHandleIds.has(k.id));
    // Sights traced onto a barrel keep the sight families' finer grid.
    const barrelSights = def.solids.filter((s) => family.name === 'barrel' && s.id.startsWith('front-sight-'));
    const numbers = [
      ...def.solids.flatMap((s) =>
        s.kind === 'box' &&
        !s.id.startsWith('trigger-guard-') &&
        !barrelSights.includes(s) &&
        !(family.name === 'magazine' && params.profile === 'smg') &&
        !(explicitCarrierStyle && s.slot === 'metal')
          ? bounds(s.box)
          : [],
      ),
      ...def.keepOuts.flatMap((k) =>
        (explicitCarrierStyle && k.id.startsWith(`${params.handleStyle}-handle-`)) || fineHandleKeepOuts.includes(k)
          ? []
          : bounds(k.box),
      ),
      ...def.ports.flatMap((p) => [...p.pos, p.slots?.pitch ?? 0]),
      ...def.axes
        .filter((axis) => family.name !== 'revolver-cylinder' || axis.kind !== 'bore')
        .flatMap((axis) => [...axis.origin]),
    ];
    return {
      geometryOnGrid:
        numbers.every((n) => onGridWithCarrierClearance(n, gridStep, family)) &&
        fineHandleKeepOuts.flatMap((k) => bounds(k.box)).every((n) => onGrid(n, GRID / 5)) &&
        barrelSights.flatMap((s) => (s.kind === 'box' ? bounds(s.box) : [])).every((n) => onGrid(n, GRID / 4)),
      portsOrthonormal: def.ports.every(
        (p) =>
          Math.abs(length(p.normal) - 1) < 1e-6 &&
          Math.abs(length(p.up) - 1) < 1e-6 &&
          Math.abs(dot(p.normal, p.up)) < 1e-6 &&
          Math.abs(length(cross(p.normal, p.up)) - 1) < 1e-6,
      ),
      uniquePortIds: new Set(def.ports.map((p) => p.id)).size === def.ports.length,
      positiveBoxSizes: def.solids.every((s) => s.kind !== 'box' || s.box.half.every((h) => h > 0)),
    };
  };
  const expected = {
    geometryOnGrid: true,
    portsOrthonormal: true,
    uniquePortIds: true,
    positiveBoxSizes: true,
  };

  if (batchSize === 1) {
    for (const params of cases) {
      const tag = JSON.stringify(params);
      it(`${tag}: geometry and port definitions are valid on the ${gridStep}u grid`, () => {
        expect(check(params), tag).toEqual(expected);
      });
    }
    return;
  }

  for (let start = 0; start < cases.length; start += batchSize) {
    const batch = cases.slice(start, start + batchSize);
    it(`cases ${start}-${start + batch.length - 1}: geometry and port definitions are valid on the ${gridStep}u grid`, () => {
      for (const params of batch) {
        expect(check(params), JSON.stringify(params)).toEqual(expected);
      }
    });
  }
};
