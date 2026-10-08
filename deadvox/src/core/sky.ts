// Sun position, sky colour, light and fog by time of day. Pure numbers; the renderer
// applies them (render/sky.ts). The palette is muted (DESIGN.md, "Rendering"), and
// nights are dark: the flashlight arrives in milestone 1.6, and the values are tuned
// with it.

import type { Vec3 } from './coords.ts';
import { type DayCycle, type DayPhase, type DayPhaseState, DEFAULT_DAY_CYCLE, dayPhaseAt } from './dayPhase.ts';

/** sRGB in [0, 1], as in CSS hex colours. */
export type Rgb = readonly [number, number, number];

export interface Sky {
  dayPhase: DayPhase;
  /** Background colour; the fog fades to it. */
  sky: Rgb;
  /** Unit vector towards the main light: the sun by day, the moon by night. */
  light: Vec3;
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
}

type Look = Omit<Sky, 'light' | 'dayPhase'>;

const hex = (n: number): Rgb => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

const NIGHT: Look = {
  sky: hex(0x0a_0d_12),
  lightColor: hex(0x7d_8c_a8),
  lightIntensity: 0.12,
  ambientSky: hex(0x3a_46_5a),
  ambientGround: hex(0x10_0e_0c),
  ambientIntensity: 0.22,
  fogNear: 0.1,
  fogFar: 0.5,
  heightFog: 0.01,
  heightFogColor: hex(0x1c_24_30),
  bloom: 0.5,
  tone: 1,
};

/** The dead of night: the dusk glow is gone, and there's barely more than shapes. */
const DEEP_NIGHT: Look = {
  sky: hex(0x04_05_08),
  lightColor: hex(0x6a_76_90),
  lightIntensity: 0.05,
  ambientSky: hex(0x1c_23_30),
  ambientGround: hex(0x05_05_05),
  ambientIntensity: 0.1,
  fogNear: 0.05,
  fogFar: 0.35,
  heightFog: 0.012,
  heightFogColor: hex(0x12_18_21),
  bloom: 0.55,
  tone: 1,
};

const DAWN: Look = {
  sky: hex(0x8a_80_7e),
  lightColor: hex(0xf0_b0_88),
  lightIntensity: 0.7,
  ambientSky: hex(0xb8_b0_b0),
  ambientGround: hex(0x4a_40_38),
  ambientIntensity: 0.8,
  fogNear: 0.3,
  fogFar: 0.8,
  heightFog: 0.014,
  heightFogColor: hex(0xb0_9a_90),
  bloom: 0.2,
  tone: 0.85,
};

/** The look before time of day existed; the benchmark still renders with it. */
const DAY: Look = {
  sky: hex(0xa9_bf_d0),
  lightColor: hex(0xff_f2_dd),
  lightIntensity: 1.6,
  ambientSky: hex(0xdf_e8_f0),
  ambientGround: hex(0x5a_4a_3a),
  ambientIntensity: 1.3,
  fogNear: 0.6,
  fogFar: 0.95,
  heightFog: 0.002,
  heightFogColor: hex(0xb4_c6_d4),
  bloom: 0.08,
  tone: 0,
};

const DUSK: Look = {
  sky: hex(0x6e_5e_5c),
  lightColor: hex(0xe8_98_68),
  lightIntensity: 0.6,
  ambientSky: hex(0x9a_8c_90),
  ambientGround: hex(0x3a_30_2a),
  ambientIntensity: 0.7,
  fogNear: 0.3,
  fogFar: 0.8,
  heightFog: 0.008,
  heightFogColor: hex(0x8a_6e_66),
  bloom: 0.25,
  tone: 0.85,
};

// Look keys belong to solar phases. Their positions move with latitude and date;
// the DAWN key is at sunrise and the DUSK key is at sunset.
interface LookKey {
  phase: DayPhase;
  at: number;
  look: Look;
}
const KEYS: readonly LookKey[] = [
  { phase: 'night', at: 0, look: NIGHT },
  { phase: 'night', at: 0.3, look: DEEP_NIGHT },
  { phase: 'night', at: 0.7, look: DEEP_NIGHT },
  { phase: 'night', at: 0.9, look: NIGHT },
  { phase: 'dawn', at: 0, look: NIGHT },
  { phase: 'dawn', at: 1, look: DAWN },
  { phase: 'day', at: 0.12, look: DAY },
  { phase: 'day', at: 0.85, look: DAY },
  { phase: 'day', at: 0.95, look: DUSK },
  { phase: 'dusk', at: 0, look: DUSK },
  { phase: 'dusk', at: 0.72, look: NIGHT },
];

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
});

const lookAt = (state: DayPhaseState, time: number): Look => {
  const keys = KEYS.map((key) => {
    const [start, end] = phaseRange(state, key.phase);
    const duration = wrap(end - start);
    return { phasePosition: wrap(start + duration * key.at), look: key.look };
  }).sort((a, b) => a.phasePosition - b.phasePosition);
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
  return NIGHT;
};

/** Sun direction from the single latitude/date model, with east/up/north axes. */
export const sunDirection = (hour: number, cycle: DayCycle = DEFAULT_DAY_CYCLE): Vec3 =>
  dayPhaseAt(cycle, hour * 3600).sunDirection;

/** Lowest elevation of the main light, so it never grazes the ground at sunrise and sunset. */
const MIN_LIGHT_Y = 0.2;

/** The sky, light and fog at a local solar hour in [0, 24). */
export const skyAt = (hour: number, cycle: DayCycle = DEFAULT_DAY_CYCLE): Sky => {
  const time = hour * 3600;
  const state = dayPhaseAt(cycle, time);
  // The light follows the sun's continuous arc; the night palette supplies the moon-like light.
  const [x, , z] = state.sunDirection;
  const y = Math.max(state.sunDirection[1], MIN_LIGHT_Y);
  const len = Math.hypot(x, y, z);
  return { ...lookAt(state, time), dayPhase: state.phase, light: [x / len, y / len, z / len] };
};

/** Sun elevation (the sine of its angle above the horizon) at which its shadows are at full strength: the lighting clamp's `MIN_LIGHT_Y`, where the light is the sun's real direction. */
const FULL_SHADOW_ELEVATION = MIN_LIGHT_Y;
/** Light intensity range over which shadows fade in: below it only a moon-like glimmer, above it a real sun. */
const SHADOW_INTENSITY_FADE: readonly [number, number] = [0.25, 0.6];

const smoothstep = (from: number, to: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * How strongly the sun's shadows show, in [0, 1]: 0 at night (where `skyAt`'s light is a stand-in
 * for a moon, which casts none) and below the horizon, rising smoothly as the sun climbs, and
 * dimmed with the light itself (so overcast weather fades them). `sunElevation` is
 * `sunDirection(hour)[1]`, which goes negative at night, unlike the lighting's own direction.
 */
export const sunShadowStrength = (sunElevation: number, lightIntensity: number): number =>
  smoothstep(0, FULL_SHADOW_ELEVATION, sunElevation) * smoothstep(...SHADOW_INTENSITY_FADE, lightIntensity);

/** The daytime look, for the benchmark. */
export const DAY_SKY: Sky = skyAt(12);
