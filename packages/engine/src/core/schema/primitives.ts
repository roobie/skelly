import {
  check,
  integer,
  maxValue,
  minValue,
  nonEmpty,
  number,
  pipe,
  regex,
  strictObject,
  string,
  transform,
  tuple,
} from 'valibot';
import { SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../character.ts';
import { FIREARMS_SKILL_ZERO_RANGES } from '../firearmsSkill.ts';
import {
  gameHours,
  gameMinutes,
  gamePerHour,
  gameTimeOfDay,
  realSeconds,
  simAcceleration,
  simPerMinute,
  simRate,
  simSeconds,
} from '../time.ts';

const ID_PATTERN = /^[a-z0-9_]+$/;

const CALIBRE_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export const Id = pipe(string(), regex(ID_PATTERN, 'must be lowercase letters, digits and _'));

export const CalibreId = pipe(string(), regex(CALIBRE_ID_PATTERN, 'must be a cartridge-data id'));

export const Name = pipe(string(), nonEmpty('must not be empty'));

export const Color = pipe(string(), regex(/^#[0-9a-fA-F]{6}$/, 'expected "#rrggbb"'));

export const NonNegative = pipe(number(), minValue(0, 'must be 0 or more'));

export const Positive = pipe(number(), minValue(Number.MIN_VALUE, 'must be more than 0'));

export const Count = pipe(number(), integer('must be a whole number'), minValue(0, 'must be 0 or more'));

export const SkillLevel = pipe(
  number(),
  integer('must be a whole number'),
  minValue(SKILL_LEVEL_MIN, `must be at least ${SKILL_LEVEL_MIN}`),
  maxValue(SKILL_LEVEL_MAX, `must be at most ${SKILL_LEVEL_MAX}`),
);

export const Fraction = pipe(number(), minValue(0, 'must be 0 to 1'), maxValue(1, 'must be 0 to 1'));

const skillZeroFactor = ({ min, max }: { min: number; max: number }) =>
  pipe(number(), minValue(min, `must be at least ${min}`), maxValue(max, `must be at most ${max}`));

const FirearmsSkillZeroEffectSchema = strictObject({
  variance: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.variance),
  recoilKickScale: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.recoilKickScale),
  recoilRecoveryScale: skillZeroFactor(FIREARMS_SKILL_ZERO_RANGES.recoilRecoveryScale),
});

export const FirearmsSkillZeroHandlingSchema = strictObject({
  singleShot: FirearmsSkillZeroEffectSchema,
  automaticFollowup: FirearmsSkillZeroEffectSchema,
});

export const QualityLevel = pipe(number(), integer('must be a whole number'), minValue(1), maxValue(5));

export const SimSeconds = pipe(NonNegative, transform(simSeconds));

export const PositiveSimSeconds = pipe(Positive, transform(simSeconds));

export const PositiveRealSeconds = pipe(Positive, transform(realSeconds));

export const SimRate = pipe(Positive, transform(simRate));

export const NonNegativeSimRate = pipe(NonNegative, transform(simRate));

export const SimAcceleration = pipe(Positive, transform(simAcceleration));

export const SimDurationRange = strictObject({ min: PositiveSimSeconds, max: PositiveSimSeconds });

export const PositiveGameHours = pipe(Positive, transform(gameHours));

export const PositiveGameMinutes = pipe(Positive, transform(gameMinutes));

export const GameMinutes = pipe(NonNegative, transform(gameMinutes));

export const GamePerHour = pipe(Positive, transform(gamePerHour));

export const SimPerMinute = pipe(Positive, transform(simPerMinute));

export const GameTimeOfDay = pipe(
  string(),
  regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM'),
  transform((text) => {
    const [hours, minutes] = text.split(':').map(Number);
    return gameTimeOfDay(hours! * 3600 + minutes! * 60);
  }),
);

/** An inclusive [min, max] range. */
export const range = <S extends typeof Count | typeof Fraction>(item: S) =>
  pipe(
    tuple([item, item]),
    check(([min, max]) => min <= max, 'min must not be more than max'),
  );

/** [x, y, z] in blocks. */
export const Size = tuple([
  pipe(Count, minValue(1, 'must be at least 1')),
  pipe(Count, minValue(1, 'must be at least 1')),
  pipe(Count, minValue(1, 'must be at least 1')),
]);
