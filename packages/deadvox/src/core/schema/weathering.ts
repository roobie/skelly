import { maxValue, minValue, number, pipe, strictObject } from 'valibot';
import { WEATHERING_RANGES } from '../weather.ts';
import { Color, Id } from './primitives.ts';

const weatheringNumber = (field: keyof typeof WEATHERING_RANGES) => {
  const { min, max } = WEATHERING_RANGES[field];
  return pipe(number(), minValue(min), maxValue(max));
};

export const WeatheringSchema = strictObject({
  id: Id,
  /** Shared weathering strength for the rendered site. */
  strength: weatheringNumber('strength'),
  /** Linear tint multiplier for grime. */
  tintColor: Color,
  /** Grime darkness multiplier, before the profile's mix ceiling. */
  tintDarkness: weatheringNumber('tintDarkness'),
  /** Streak tint, blended from the grime tint where runoff appears. */
  streakColor: Color,
  /** Amount of vertical runoff mixed into the profile. */
  streakStrength: weatheringNumber('streakStrength'),
  /** World-space period of vertical runoff, in metres. */
  streakLengthMetres: weatheringNumber('streakLengthMetres'),
  /** Organic patch colour. */
  mossColor: Color,
  /** Amount of moss mixed into the profile; zero disables moss independently. */
  mossStrength: weatheringNumber('mossStrength'),
  /** World-space wavelength for broad weathering changes, in metres. */
  variationScaleMetres: weatheringNumber('variationScaleMetres'),
  /** Strength of world-scale weathering variation. */
  variationStrength: weatheringNumber('variationStrength'),
  /** Noise cutoff for organic moss and damp patches. */
  mossThreshold: weatheringNumber('mossThreshold'),
  /** How much shelter and ground proximity lower the organic-patch cutoff. */
  mossBias: weatheringNumber('mossBias'),
  /** Upper bound for the final combined grime, streak and moss mix. */
  mixCeiling: weatheringNumber('mixCeiling'),
  /** Blend from multiplicative weathering toward opaque grime/moss colours. */
  weatheringBlend: weatheringNumber('weatheringBlend'),
});
