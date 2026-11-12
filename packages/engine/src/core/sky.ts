// Sun position, sky colour, light and fog by time of day. Pure numbers; the renderer
// applies them (render/sky.ts). The palette is muted (`packages/deadvox/DESIGN.md`, "Rendering"), and
// nights are dark. The looks and where they sit in each phase are content: the day
// cycle's `looks` and `keys` (`packages/deadvox/docs/content.md`, "Day cycle"); this file only blends them.

import type { Vec3 } from './coords.ts';
import { type DayCycle, type DayPhase, type DayPhaseState, dayPhaseAt } from './dayPhase.ts';
import type { DayCycleDef } from './schema.ts';

/** sRGB in [0, 1], as in CSS hex colours. */
export type Rgb = readonly [number, number, number];

/** The sky dome of one look (`packages/engine/src/core/schema/dayCycle.ts`, `DomeLookSchema`); each kind of cloud's shape is the cycle's `clouds`. */
export interface Dome {
  /** Colour straight up. */
  zenith: Rgb;
  /** Colour of the band just above the horizon, between the fog colour and the zenith. */
  horizonGlow: Rgb;
  /**
   * The physical sky: weight 0 is the keyed gradient only, 1 the physical sky once the sun is high enough; the dome
   * scales it by how far the sun is up the `physicalBand`, so a low sun draws the gradient whatever the weight. The
   * rest are the model's own terms.
   */
  physical: {
    weight: number;
    exposure: number;
    turbidity: number;
    rayleigh: number;
    mie: number;
    mieDirectional: number;
  };
  /**
   * Cloud threshold shift, the scale of every cloud's opacity, and the scatter kind's share of the clouds, the rest
   * being the layered field's; the share is the weather's, not the look's (core/weather.ts, `skyInWeather`).
   */
  clouds: { cover: number; opacity: number; scatter: number };
  stars: number;
  moon: { colour: Rgb; brightness: number };
  sun: { colour: Rgb; brightness: number; glowColour: Rgb; glow: number };
}

/** A kind of cloud the dome draws. */
export type CloudKind = DayCycleDef['weather']['fair']['kind'];
/** Each kind of cloud's shape and the dome's other fixed shape, which the cycle holds once for every look. */
export type Clouds = DayCycleDef['clouds'];
export type DomeShape = DayCycleDef['domeShape'];
/** How the sky's reflection on models is baked and how strong it is. */
export type SkyEnvironmentTuning = DayCycleDef['environment'];

export interface Sky {
  dayPhase: DayPhase;
  /** The fog colour, which is also the sky dome's colour at the horizon. */
  sky: Rgb;
  /**
   * Unit vector towards the main light: the sun's bearing by day and the drawn moon's by night, each raised to the
   * cycle's lowest light height, blended by how bright the drawn moon is.
   */
  light: Vec3;
  /** The true solar direction, unclamped, so a sky dome can draw the sun at and below the horizon. */
  sunDirection: Vec3;
  /** Where the dome draws the moon, unclamped (`moonDirection`). */
  moonDirection: Vec3;
  lightColor: Rgb;
  lightIntensity: number;
  /** Hemisphere light: sky and ground colours and intensity. */
  ambientSky: Rgb;
  ambientGround: Rgb;
  ambientIntensity: number;
  /** Fog start and end as fractions of the view radius. */
  fogNear: number;
  fogFar: number;
  /**
   * Height-fog density per metre of view path at the mist's base height; the mist thins with altitude.
   * This is the keyframe's value at the default fogginess; core/weather.ts scales it.
   */
  heightFog: number;
  /** Colour of the height mist: sky-like by day, warmed by the low sun at dawn and dusk, a pale cool at night. */
  heightFogColor: Rgb;
  /** Bloom strength: a faint halo by day, a stronger one by night when little else is bright. */
  bloom: number;
  /**
   * Weight of ACES Filmic in the `auto` tone mapping, the rest being Neutral: 0 is Neutral, 1 is ACES.
   * Neutral reads best in bright daylight, ACES at dawn, dusk and night, where it gives the flashlit dark
   * its depth (render/autoTone.ts). Time of day only: the weather does not move it.
   */
  tone: number;
  dome: Dome;
}

/** A keyframe look, which leaves the kind of cloud to the weather. */
type Look = DayCycleDef['looks']['day'];
type LookDome = Look['dome'];

const DAY_SECONDS = 24 * 60 * 60;
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const wrap = (value: number): number => ((value % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;

const phaseRange = (state: DayPhaseState, phase: DayPhase): readonly [number, number] => {
  switch (phase) {
    case 'night':
      return [state.nightfall, state.dawn];
    case 'dawn':
      return [state.dawn, state.sunrise];
    case 'day':
      return [state.sunrise, state.sunset];
    case 'dusk':
      return [state.sunset, state.nightfall];
    default:
      throw new Error(`Unknown day phase: ${phase}`);
  }
};

const interpolateDome = (a: LookDome, b: LookDome, t: number): LookDome => ({
  zenith: mixRgb(a.zenith, b.zenith, t),
  horizonGlow: mixRgb(a.horizonGlow, b.horizonGlow, t),
  physical: {
    weight: mix(a.physical.weight, b.physical.weight, t),
    exposure: mix(a.physical.exposure, b.physical.exposure, t),
    turbidity: mix(a.physical.turbidity, b.physical.turbidity, t),
    rayleigh: mix(a.physical.rayleigh, b.physical.rayleigh, t),
    mie: mix(a.physical.mie, b.physical.mie, t),
    mieDirectional: mix(a.physical.mieDirectional, b.physical.mieDirectional, t),
  },
  clouds: { cover: mix(a.clouds.cover, b.clouds.cover, t), opacity: mix(a.clouds.opacity, b.clouds.opacity, t) },
  stars: mix(a.stars, b.stars, t),
  moon: { colour: mixRgb(a.moon.colour, b.moon.colour, t), brightness: mix(a.moon.brightness, b.moon.brightness, t) },
  sun: {
    colour: mixRgb(a.sun.colour, b.sun.colour, t),
    brightness: mix(a.sun.brightness, b.sun.brightness, t),
    glowColour: mixRgb(a.sun.glowColour, b.sun.glowColour, t),
    glow: mix(a.sun.glow, b.sun.glow, t),
  },
});

const interpolate = (a: Look, b: Look, t: number): Look => ({
  sky: mixRgb(a.sky, b.sky, t),
  lightColor: mixRgb(a.lightColor, b.lightColor, t),
  lightIntensity: mix(a.lightIntensity, b.lightIntensity, t),
  ambientSky: mixRgb(a.ambientSky, b.ambientSky, t),
  ambientGround: mixRgb(a.ambientGround, b.ambientGround, t),
  ambientIntensity: mix(a.ambientIntensity, b.ambientIntensity, t),
  fogNear: mix(a.fogNear, b.fogNear, t),
  fogFar: mix(a.fogFar, b.fogFar, t),
  heightFog: mix(a.heightFog, b.heightFog, t),
  heightFogColor: mixRgb(a.heightFogColor, b.heightFogColor, t),
  bloom: mix(a.bloom, b.bloom, t),
  tone: mix(a.tone, b.tone, t),
  dome: interpolateDome(a.dome, b.dome, t),
});

const lookAt = (state: DayPhaseState, time: number, cycle: DayCycleDef): Look => {
  const { looks } = cycle;
  const keys = cycle.keys
    .map((key) => {
      const [start, end] = phaseRange(state, key.phase);
      const duration = wrap(end - start);
      return { phasePosition: wrap(start + duration * key.at), look: looks[key.look] };
    })
    .sort((a, b) => a.phasePosition - b.phasePosition);
  const now = wrap(time);
  for (let i = 0; i < keys.length; i++) {
    const a = keys[i]!;
    const b = keys[(i + 1) % keys.length]!;
    const end = b.phasePosition > a.phasePosition ? b.phasePosition : b.phasePosition + DAY_SECONDS;
    const current = now >= a.phasePosition ? now : now + DAY_SECONDS;
    if (current >= a.phasePosition && current < end) {
      return interpolate(a.look, b.look, (current - a.phasePosition) / (end - a.phasePosition));
    }
  }
  return looks.night;
};

/** Sun direction from the single latitude/date model, with east/up/north axes. */
export const sunDirection = (hour: number, cycle: DayCycle): Vec3 => dayPhaseAt(cycle, hour * 3600).sunDirection;

/** Where the moon is drawn: opposite the sun. The dome and the main light both take it from here. */
const moonDirection = (sun: Vec3): Vec3 => [-sun[0], -sun[1], -sun[2]];

/** A unit direction raised to at least `lowest`, the sine of its elevation, keeping its bearing. */
const raised = ([x, y, z]: Vec3, lowest: number): Vec3 => {
  if (y >= lowest) {
    return [x, y, z];
  }
  const across = Math.hypot(x, z);
  if (across === 0) {
    // Straight down has no bearing to keep.
    return [0, 1, 0];
  }
  const scale = Math.sqrt(1 - lowest * lowest) / across;
  return [x * scale, lowest, z * scale];
};

/**
 * The main light comes from the sun's side by day and the moon's by night, blended by the drawn moon's brightness so
 * twilight swings it across without a jump. Both sides sit at or above the lowest height, which content keeps above
 * the horizon, so the blend never cancels to nothing.
 */
const mainLight = (sun: Vec3, moon: Vec3, moonBrightness: number, tuning: DayCycleDef['mainLight']): Vec3 => {
  const share = Math.min(moonBrightness / tuning.fromMoonAt, 1);
  const from = raised(sun, tuning.lowestHeight);
  const to = raised(moon, tuning.lowestHeight);
  const blended: Vec3 = [mix(from[0], to[0], share), mix(from[1], to[1], share), mix(from[2], to[2], share)];
  const length = Math.hypot(...blended);
  return [blended[0] / length, blended[1] / length, blended[2] / length];
};

/**
 * How much of the looks' moon and stars a sun at this height leaves: all of them in the dark, none once the sky has
 * brightened. Linear blends between looks fade them too slowly for a bright disc against a greying dawn sky.
 */
export const nightSkyShare = (sunHeight: number, [from, to]: readonly [number, number]): number => {
  const t = Math.min(1, Math.max(0, (sunHeight - from) / (to - from)));
  return 1 - t * t * (3 - 2 * t);
};

/** The scatter kind's share of the clouds when `kind` shows alone. */
export const scatterShare = (kind: CloudKind): number => (kind === 'scatter' ? 1 : 0);

/** The sky, light and fog at a local solar hour in [0, 24), with the clouds of fair weather, whose sky the looks are. */
export const skyAt = (hour: number, cycle: DayCycleDef): Sky => {
  const time = hour * 3600;
  const state = dayPhaseAt(cycle, time);
  const moon = moonDirection(state.sunDirection);
  const look = lookAt(state, time, cycle);
  const nightSky = nightSkyShare(state.sunDirection[1], cycle.domeShape.washOutBand);
  const dome: Dome = {
    ...look.dome,
    clouds: { ...look.dome.clouds, scatter: scatterShare(cycle.weather.fair.kind) },
    stars: look.dome.stars * nightSky,
    moon: { ...look.dome.moon, brightness: look.dome.moon.brightness * nightSky },
  };
  return {
    ...look,
    dome,
    dayPhase: state.phase,
    light: mainLight(state.sunDirection, moon, dome.moon.brightness, cycle.mainLight),
    sunDirection: state.sunDirection,
    moonDirection: moon,
  };
};

/**
 * How strongly the main light's shadows show: full whenever it shines, low sun and the moon at night
 * included, and none (no map to draw) when it is out. A weaker shadow passes the rest of the light
 * through whatever the map blocks and would light a sealed room's sun-facing walls; a sealed room
 * stays dark at every hour.
 */
export const sunShadowStrength = (lightIntensity: number): number => (lightIntensity > 0 ? 1 : 0);
