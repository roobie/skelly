// Shared exported timing contract: mechanics and held projection use the same clock.
import type { Motion } from '@skelly/motion/motion';
import type { ModelDef } from './content.ts';

export type FirearmAction = NonNullable<NonNullable<ModelDef['gun']>['action']>;
export type FirearmMode = 'fire' | 'hand';
type ActionLeg = NonNullable<FirearmAction['fire']>['legs'][number];

/** The stop a part is fully drawn back at: the timelines' legs go to it by name, so no clock is assumed to be open. */
export const OPEN_STOP = 'open';

export const actionCycleSeconds = (action: FirearmAction, mode: FirearmMode): number => {
  if (mode === 'hand') {
    return action.hand.durationSimSeconds;
  }
  if (!(action.fire && action.roundsPerSimMinute)) {
    throw new Error('No exported automatic action data for this gun');
  }
  return Math.min(action.fire.durationSimSeconds, 1 / action.roundsPerSimMinute);
};

/** The stop a bolt turns to before it draws back; a part may hinge without one, as a charging handle into its notch. */
export const UNLOCKED_STOP = 'unlocked';

export const hasHinge = (motion: Motion | undefined): boolean =>
  motion?.stages.some((stage) => stage.kind === 'hinge') ?? false;

/** A bolt gun is one whose parts turn to unlock: a part with an `unlocked` stop. */
export const isBoltAction = (action: FirearmAction): boolean =>
  Object.values(action.parts).some(({ motion }) => motion?.stops.some((stop) => stop.name === UNLOCKED_STOP));

/** Where a motion's clock stands at its `open` stop. */
export const openClock = (motion: Motion | undefined): number =>
  motion?.stops.find((stop) => stop.name === OPEN_STOP)?.clock ?? 0;

const timelineOf = (action: FirearmAction, mode: FirearmMode): NonNullable<FirearmAction['fire']> => {
  const timeline = action[mode];
  if (!timeline) {
    throw new Error('No exported automatic action data for this gun');
  }
  return timeline;
};

const secondsOf = (legs: readonly ActionLeg[]): number => legs.reduce((sum, { seconds }) => sum + seconds, 0);

/**
 * Where a timeline draws a part back, in its seconds: the reach before the first leg to `open`, that leg's draw, the
 * release at the end of the last leg to `open`, and the leg after it that brings the part forward.
 */
export const actionStrokeTimes = (
  action: FirearmAction,
  mode: FirearmMode = 'hand',
): { reach: number; draw: number; release: number; forward: number } => {
  const { legs } = timelineOf(action, mode);
  const first = legs.findIndex(({ to }) => to === OPEN_STOP);
  const last = legs.findLastIndex(({ to }) => to === OPEN_STOP);
  if (first < 0) {
    throw new Error('No leg of this action goes to open');
  }
  return {
    reach: secondsOf(legs.slice(0, first)),
    draw: legs[first]!.seconds,
    release: secondsOf(legs.slice(0, last + 1)),
    forward: legs[last + 1]?.seconds ?? 0,
  };
};

/** The seconds through the last leg to `open`: when the part has drawn back and has held, before its return. */
export const actionOpenSeconds = (action: FirearmAction, mode: FirearmMode = 'hand'): number =>
  actionStrokeTimes(action, mode).release;

/**
 * How far along its motion a part with these stops is `seconds` into a timeline: each leg runs its clock linearly from
 * the stop it is at to the leg's stop, and a part past the last leg stays where it ended, at rest.
 */
export const actionClock = (
  action: FirearmAction,
  mode: FirearmMode,
  stops: readonly { readonly name: string; readonly clock: number }[],
  seconds: number,
): number => {
  let clock = stops[0]?.clock ?? 0;
  let start = 0;
  for (const { to, seconds: length } of timelineOf(action, mode).legs) {
    const target = stops.find((stop) => stop.name === to)?.clock ?? clock;
    if (seconds < start + length) {
      return clock + ((target - clock) * Math.max(0, seconds - start)) / length;
    }
    clock = target;
    start += length;
  }
  return clock;
};

export const actionPhaseSeconds = (action: FirearmAction, mode: FirearmMode, phase?: 'open' | 'close'): number => {
  if (phase === 'open') {
    return actionOpenSeconds(action, mode);
  }
  const full = actionCycleSeconds(action, mode);
  return phase === 'close' ? full - actionOpenSeconds(action, mode) : full;
};

/** The seconds into the timeline the case leaves: the reach, then `ejectAt` of the first draw back. */
export const ejectSeconds = (action: FirearmAction, mode: FirearmMode): number => {
  const { reach, draw } = actionStrokeTimes(action, mode);
  return (
    ((reach + draw * action.ejectAt) * actionCycleSeconds(action, mode)) / timelineOf(action, mode).durationSimSeconds
  );
};
