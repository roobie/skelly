import {
  array,
  boolean,
  check,
  finite,
  type InferOutput,
  integer,
  maxValue,
  minValue,
  nonEmpty,
  number,
  pipe,
  strictObject,
  string,
} from 'valibot';

const Positive = pipe(number(), finite(), minValue(Number.MIN_VALUE));
const AdaptiveScaleSchema = pipe(
  strictObject({
    enabled: boolean(),
    targetRealMs: Positive,
    min: pipe(Positive, maxValue(1)),
    max: pipe(Positive, maxValue(1)),
    step: pipe(Positive, maxValue(1)),
    hysteresisRealMs: pipe(number(), finite(), minValue(0)),
    sampleWindow: pipe(number(), integer(), minValue(1)),
  }),
  check(
    (value) => value.min <= value.max && value.hysteresisRealMs < value.targetRealMs,
    'invalid adaptive range or hysteresis',
  ),
);

/** A scale up to 1; `floor` is the least its bounds may be. */
const scaleOptionSchema = (floor: number) =>
  pipe(
    strictObject({
      label: pipe(string(), nonEmpty()),
      default: pipe(number(), finite()),
      min: pipe(number(), finite(), minValue(floor), maxValue(1)),
      max: pipe(number(), finite(), minValue(floor), maxValue(1)),
    }),
    check(
      ({ min, max, default: value }) => min <= max && value >= min && value <= max,
      'range must be ordered and contain the default',
    ),
  );
const ScaleOptionSchema = scaleOptionSchema(Number.MIN_VALUE);
/** A strength that may be turned off entirely. */
const ShareOptionSchema = scaleOptionSchema(0);

const ToggleOptionSchema = pipe(
  strictObject({
    label: pipe(string(), nonEmpty()),
    default: boolean(),
    options: pipe(array(boolean()), nonEmpty()),
  }),
  check(
    ({ options, default: value }) => new Set(options).size === options.length && options.includes(value),
    'options must be unique and contain the default',
  ),
);

export const GRAPHICS_KNOBS = {
  renderScale: {
    kind: 'scale',
    url: 'renderscale',
    schema: pipe(
      strictObject({ ...ScaleOptionSchema.entries, adaptive: AdaptiveScaleSchema }),
      check(
        ({ min, max, default: value, adaptive }) =>
          min <= max && value >= min && value <= max && adaptive.min >= min && adaptive.max <= max,
        'scale bounds must contain default and adaptive bounds',
      ),
    ),
  },
  bloomScale: { kind: 'scale', url: 'bloomscale', schema: ScaleOptionSchema },
  drugVignette: { kind: 'scale', url: 'drugvignette', schema: ShareOptionSchema },
  smallSunMap: { kind: 'toggle', url: 'sunsmall', schema: ToggleOptionSchema },
  fastCamo: { kind: 'toggle', url: 'camofast', schema: ToggleOptionSchema },
  coarseWeathering: { kind: 'toggle', url: 'weathercoarse', schema: ToggleOptionSchema },
  cachedSurfaceNoise: { kind: 'toggle', url: 'surfacenoise', schema: ToggleOptionSchema },
} as const;

export type GraphicsKey = keyof typeof GRAPHICS_KNOBS;
export const GRAPHICS_KEYS = Object.keys(GRAPHICS_KNOBS) as GraphicsKey[];
type OptionSchemas = { [K in GraphicsKey]: (typeof GRAPHICS_KNOBS)[K]['schema'] };
export const GraphicsOptionsSchema = strictObject(
  Object.fromEntries(GRAPHICS_KEYS.map((key) => [key, GRAPHICS_KNOBS[key].schema])) as OptionSchemas,
);
export type GraphicsOptions = InferOutput<typeof GraphicsOptionsSchema>;
export type GraphicsValues = { [K in GraphicsKey]: GraphicsOptions[K]['default'] };
export type GraphicsSettings = Partial<GraphicsValues>;

const graphicsValueAllowed = (
  tuning: GraphicsOptions,
  key: GraphicsKey,
  value: unknown,
): value is GraphicsValues[GraphicsKey] => {
  const option = tuning[key];
  if ('options' in option) {
    return typeof value === 'boolean' && option.options.includes(value);
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= option.min && value <= option.max;
};

/** Ignore stale or malformed choices instead of allowing stored data to bypass content bounds. */
export const validGraphicsSettings = (tuning: GraphicsOptions, input: unknown): GraphicsSettings => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {};
  }
  return Object.fromEntries(
    GRAPHICS_KEYS.flatMap((key) => {
      const value = (input as Record<string, unknown>)[key];
      return graphicsValueAllowed(tuning, key, value) ? [[key, value]] : [];
    }),
  ) as GraphicsSettings;
};

export const assertGraphicsValue = (tuning: GraphicsOptions, key: GraphicsKey, value: unknown): void => {
  if (!graphicsValueAllowed(tuning, key, value)) {
    throw new RangeError(`Graphics setting ${key} is outside the content's allowed choices`);
  }
};

export const setGraphicsSetting = <K extends GraphicsKey>(
  tuning: GraphicsOptions,
  settings: GraphicsSettings,
  key: K,
  value: GraphicsValues[K],
): GraphicsSettings => {
  assertGraphicsValue(tuning, key, value);
  return { ...validGraphicsSettings(tuning, settings), [key]: value };
};

/** The single precedence boundary: URL override > player setting > mod default. */
export const resolveGraphics = (
  tuning: GraphicsOptions,
  player: GraphicsSettings = {},
  url: GraphicsSettings = {},
): GraphicsValues =>
  ({
    ...Object.fromEntries(GRAPHICS_KEYS.map((key) => [key, tuning[key].default])),
    ...validGraphicsSettings(tuning, player),
    ...validGraphicsSettings(tuning, url),
  }) as GraphicsValues;

const parseToggle = (text: string): boolean | undefined => {
  if (text === '1') {
    return true;
  }
  return text === '0' ? false : undefined;
};

export const readGraphicsParams = (params: URLSearchParams, tuning: GraphicsOptions): GraphicsSettings => {
  const entries = GRAPHICS_KEYS.flatMap((key) => {
    const text = params.get(GRAPHICS_KNOBS[key].url);
    if (text === null || text.trim() === '') {
      return [];
    }
    const option = tuning[key];
    let value: unknown;
    if ('options' in option) {
      value = parseToggle(text);
    } else {
      const numeric = Number(text);
      value = Number.isFinite(numeric) ? Math.max(option.min, Math.min(option.max, numeric)) : undefined;
    }
    return graphicsValueAllowed(tuning, key, value) ? [[key, value]] : [];
  });
  return Object.fromEntries(entries) as GraphicsSettings;
};

/** Explicit defaults and false values are overrides too; omitting them would change precedence. */
export const writeGraphicsParams = (
  params: URLSearchParams,
  tuning: GraphicsOptions,
  overrides: GraphicsSettings,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  const valid = validGraphicsSettings(tuning, overrides);
  for (const key of GRAPHICS_KEYS) {
    const name = GRAPHICS_KNOBS[key].url;
    next.delete(name);
    const value = valid[key];
    if (value !== undefined) {
      next.set(name, String(typeof value === 'boolean' ? Number(value) : value));
    }
  }
  return next;
};
