import { check, type InferOutput, integer, maxValue, minValue, number, pipe, strictObject } from 'valibot';
import { BODY_REGIONS } from './body.ts';
import { Positive } from './schema/primitives.ts';

/**
 * Every action a radial menu may show, by menu. Each id needs an authored direction, so a new action cannot land on
 * a position chosen at run time and move the others.
 */
export const ACTION_MENU_ACTIONS = {
  furniture: ['push', 'drag', 'lift', 'repair', 'continue', 'take_apart'],
  held: ['own', 'sharpen', 'open-can', 'magazine:strip', 'battery:unload', 'continue-work', 'treat'],
} as const;

export type ActionMenuSource = keyof typeof ACTION_MENU_ACTIONS;

/** Degrees clockwise from straight up. */
const Direction = pipe(
  number(),
  minValue(0, 'must be 0 or more'),
  check((degrees) => degrees < 360, 'must be less than 360 degrees'),
);

const directionsFor = (ids: readonly string[]) =>
  strictObject(Object.fromEntries(ids.map((id) => [id, Direction])) as Record<string, typeof Direction>);

export const ActionMenuTuningSchema = strictObject({
  radiusPixels: Positive,
  deadZonePixels: Positive,
  selectionHalfAngleDegrees: pipe(Positive, maxValue(90, 'must be 90 or less')),
  pullIndicatorPixels: Positive,
  strokePixels: Positive,
  selectedLabelScale: Positive,
  labelPaddingRem: Positive,
  labelRadiusRem: Positive,
  entryCap: pipe(number(), integer('must be a whole number'), minValue(1, 'must be 1 or more')),
  directions: strictObject({
    furniture: directionsFor(ACTION_MENU_ACTIONS.furniture),
    held: directionsFor(ACTION_MENU_ACTIONS.held),
    /** The child ring of the held menu's `treat` entry, one wound per body region. */
    treat: directionsFor(BODY_REGIONS),
  }),
});

export type ActionMenuTuning = InferOutput<typeof ActionMenuTuningSchema>;

const angularGapDegrees = (a: number, b: number): number => {
  const gap = Math.abs(a - b) % 360;
  return Math.min(gap, 360 - gap);
};

/**
 * Two directions closer than two half-angles would share pointer positions, so one entry could never be picked
 * there; more directions than the cap would not fit on one ring. A dead zone reaching the entry radius would leave
 * every entry unreachable, so no pull could ever choose.
 */
export const actionMenuIssues = (tuning: ActionMenuTuning, path: string): [string, string][] => {
  const out: [string, string][] = [];
  if (tuning.deadZonePixels >= tuning.radiusPixels) {
    out.push([`${path}.deadZonePixels`, `must be less than radiusPixels ${tuning.radiusPixels}`]);
  }
  for (const [menu, directions] of Object.entries(tuning.directions)) {
    const entries = Object.entries(directions);
    entries.forEach(([action, degrees], index) => {
      const crowded = entries
        .slice(0, index)
        .find(([, other]) => angularGapDegrees(degrees, other) < 2 * tuning.selectionHalfAngleDegrees);
      if (crowded) {
        out.push([
          `${path}.directions.${menu}.${action}`,
          `is closer to "${crowded[0]}" than two selection half-angles`,
        ]);
      }
    });
    if (entries.length > tuning.entryCap) {
      out.push([`${path}.directions.${menu}`, `has more directions than entryCap ${tuning.entryCap}`]);
    }
  }
  return out;
};
