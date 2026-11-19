import { placedBlockAt } from '@skelly/engine/internal/core/templates.ts';
import type { Placement, Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { buildingBox, frames, type Lens, PLAN_CUT_M, sheetViews } from './browser/buildingSheetPage.ts';

const FRONT_ROW = 1;
const BLOCK_SIZE = 0.5;
const lens: Lens = { fovDeg: 70, aspect: 16 / 9, near: 0.05 };
const options = { blockSize: BLOCK_SIZE, lens, eyeHeightM: 1.6 };

/** A box template whose local z = 0 row is a marked block, so a test can find the front without the planner. */
const fixture = (turn: Placement['turn'], access?: Placement['template']['access']): Placement => {
  const size: Vec3 = [6, 8, 4];
  const blocks = new Uint16Array(size[0] * size[1] * size[2]).map((_, cell) =>
    Math.floor(cell / size[0]) % size[2] === 0 ? FRONT_ROW : 0,
  );
  return {
    origin: [10, 3, -7],
    turn,
    template: {
      id: 'fixture',
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      size,
      blocks,
      pieces: [],
      spawns: [],
      ...(access ? { access, groundLayer: access.storeys[0]!.floor - 1 } : {}),
    },
  };
};

/** The world centre, in metres, of the cells the marked front row landed on. */
const frontRowCentre = (placement: Placement): [number, number] => {
  const cells: [number, number][] = [];
  const [ox, oy, oz] = placement.origin;
  for (let x = ox - 10; x < ox + 10; x++) {
    for (let z = oz - 10; z < oz + 10; z++) {
      if (placedBlockAt(placement, [x, oy, z]) === FRONT_ROW) {
        cells.push([x + 0.5, z + 0.5]);
      }
    }
  }
  const mean = (axis: 0 | 1) => (cells.reduce((sum, cell) => sum + cell[axis], 0) / cells.length) * BLOCK_SIZE;
  return [mean(0), mean(1)];
};

const boxCorners = ({ min, max }: { min: Vec3; max: Vec3 }): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((c) => [c & 1 ? max[0] : min[0], c & 2 ? max[1] : min[1], c & 4 ? max[2] : min[2]]);

describe('building sheet planner', () => {
  it.each([0, 1, 2, 3] as const)(
    'puts the front camera on the turned local -z side at turn %i, framing the box',
    (turn) => {
      const placement = fixture(turn);
      const box = buildingBox(placement, BLOCK_SIZE);
      const centre = [(box.min[0] + box.max[0]) / 2, (box.min[2] + box.max[2]) / 2] as const;
      const [fx, fz] = frontRowCentre(placement);
      const outward = [fx - centre[0], fz - centre[1]] as const;
      const views = sheetViews(placement, options);
      const front = views.find(({ file }) => file === 'front.png')!;
      const back = views.find(({ file }) => file === 'back.png')!;
      const towards = (eye: Vec3) => (eye[0] - centre[0]) * outward[0] + (eye[2] - centre[1]) * outward[1];
      expect(towards(front.pose.eye)).toBeGreaterThan(0);
      expect(towards(back.pose.eye)).toBeLessThan(0);
      const face = boxCorners({ min: [box.min[0], box.grade, box.min[2]], max: box.max });
      expect(frames(front.pose, face, lens)).toBe(true);
      expect(frames(back.pose, face, lens)).toBe(true);
    },
  );

  it('plans one cut per declared storey, each above its floor and below the next', () => {
    const storeys = [
      { id: 'cellar', floor: 1 },
      { id: 'upper', floor: 5 },
    ];
    const placement = fixture(1, { ground: 'cellar', entrance: [0, 1, 0], storeys, stairs: [] });
    const plans = sheetViews(placement, options).filter(({ file }) => file.startsWith('plan-'));
    expect(plans.map(({ file }) => file)).toEqual(['plan-cellar.png', 'plan-upper.png']);
    const cuts = plans.map(({ keep }) => keep!.max[1]);
    storeys.forEach(({ floor }, i) => {
      expect(cuts[i]).toBeCloseTo((placement.origin[1] + floor) * BLOCK_SIZE + PLAN_CUT_M);
      expect(plans[i]!.pose.eye[1]).toBeGreaterThan(cuts[i]!);
    });
  });

  it('plans one ground storey when the template declares no access', () => {
    const plans = sheetViews(fixture(0), options).filter(({ file }) => file.startsWith('plan-'));
    expect(plans).toHaveLength(1);
  });
});
