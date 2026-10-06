/** Clock- and dimension-branded numeric units used inside the game. JSON is parsed into these once at its boundary. */
declare const timeBrand: unique symbol;

export type SimSeconds = number & { readonly [timeBrand]: 'SimSeconds' };
export type GameSeconds = number & { readonly [timeBrand]: 'GameSeconds' };
export type RealSeconds = number & { readonly [timeBrand]: 'RealSeconds' };
export type SimTimestamp = number & { readonly [timeBrand]: 'SimTimestamp' };
export type GameTimestamp = number & { readonly [timeBrand]: 'GameTimestamp' };
export type RealTimestamp = number & { readonly [timeBrand]: 'RealTimestamp' };
export type SimRate = number & { readonly [timeBrand]: 'SimRate' };
export type GameRate = number & { readonly [timeBrand]: 'GameRate' };
export type RealRate = number & { readonly [timeBrand]: 'RealRate' };
export type GameTimeOfDay = number & { readonly [timeBrand]: 'GameTimeOfDay' };

const finiteNonNegative = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative`);
  }
  return value;
};

/** Constructors are the only numeric-to-brand boundary for runtime values. */
export const simSeconds = (value: number): SimSeconds => finiteNonNegative(value, 'SimSeconds') as SimSeconds;
export const gameSeconds = (value: number): GameSeconds => finiteNonNegative(value, 'GameSeconds') as GameSeconds;
export const realSeconds = (value: number): RealSeconds => finiteNonNegative(value, 'RealSeconds') as RealSeconds;
export const simTimestamp = (value: number): SimTimestamp => finiteNonNegative(value, 'SimTimestamp') as SimTimestamp;
export const gameTimestamp = (value: number): GameTimestamp => finiteNonNegative(value, 'GameTimestamp') as GameTimestamp;
export const realTimestamp = (value: number): RealTimestamp => finiteNonNegative(value, 'RealTimestamp') as RealTimestamp;
export const simRate = (value: number): SimRate => finiteNonNegative(value, 'SimRate') as SimRate;
export const gameRate = (value: number): GameRate => finiteNonNegative(value, 'GameRate') as GameRate;
export const realRate = (value: number): RealRate => finiteNonNegative(value, 'RealRate') as RealRate;
export const gameTimeOfDay = (value: number): GameTimeOfDay => {
  if (!Number.isFinite(value) || value < 0 || value >= 86_400) {
    throw new RangeError('GameTimeOfDay must be in [0, 86400)');
  }
  return value as GameTimeOfDay;
};

/** Unit-normalizing constructors for numeric content fields. */
export const simMilliseconds = (value: number): SimSeconds => simSeconds(finiteNonNegative(value, 'SimMilliseconds') / 1_000);
export const simMinutes = (value: number): SimSeconds => simSeconds(finiteNonNegative(value, 'SimMinutes') * 60);
export const simHours = (value: number): SimSeconds => simSeconds(finiteNonNegative(value, 'SimHours') * 3_600);
export const gameMilliseconds = (value: number): GameSeconds => gameSeconds(finiteNonNegative(value, 'GameMilliseconds') / 1_000);
export const gameMinutes = (value: number): GameSeconds => gameSeconds(finiteNonNegative(value, 'GameMinutes') * 60);
export const gameHours = (value: number): GameSeconds => gameSeconds(finiteNonNegative(value, 'GameHours') * 3_600);
export const realMilliseconds = (value: number): RealSeconds => realSeconds(finiteNonNegative(value, 'RealMilliseconds') / 1_000);
export const realMinutes = (value: number): RealSeconds => realSeconds(finiteNonNegative(value, 'RealMinutes') * 60);
export const realHours = (value: number): RealSeconds => realSeconds(finiteNonNegative(value, 'RealHours') * 3_600);

export interface ClockConversion {
  /** Game seconds per simulation second. */
  readonly ratio: number;
  /** Game seconds at simulation timestamp zero. */
  readonly start: number;
}

/** Explicit span conversion; the Game clock starts at a different origin, so this is not for instants. */
export const simToGameSeconds = (clock: ClockConversion, span: SimSeconds): GameSeconds =>
  gameSeconds(span * clock.ratio);
export const gameToSimSeconds = (clock: ClockConversion, span: GameSeconds): SimSeconds =>
  simSeconds(span / clock.ratio);

/** Explicit instant conversion includes the saved clock origin. */
export const simToGameTimestamp = (clock: ClockConversion, instant: SimTimestamp): GameTimestamp =>
  gameTimestamp(clock.start + instant * clock.ratio);
export const gameToSimTimestamp = (clock: ClockConversion, instant: GameTimestamp): SimTimestamp =>
  simTimestamp((instant - clock.start) / clock.ratio);
