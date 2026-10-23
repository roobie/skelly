// Sun position, sky colour, light and fog by time of day. Pure numbers; the renderer
// applies them (render/sky.ts). The palette is muted (`DESIGN.md`, "Rendering"), and
// nights are dark. The looks and where they sit in each phase are content: the day
// cycle's `looks` and `keys` (`docs/content.md`, "Day cycle"); this file only blends them.

import type { Vec3 } from './coords.ts';
import { type DayCycle, type DayPhase, type DayPhaseState, dayPhaseAt } from './dayPhase.ts';
import type { DayCycleDef } from './schema.ts';

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

/** Lowest elevation of the main light, so it never grazes the ground at sunrise and sunset. */
const MIN_LIGHT_Y = 0.2;

/** The sky, light and fog at a local solar hour in [0, 24). */
export const skyAt = (hour: number, cycle: DayCycleDef): Sky => {
  const time = hour * 3600;
  const state = dayPhaseAt(cycle, time);
  // The light follows the sun's continuous arc; the night palette supplies the moon-like light.
  const [x, , z] = state.sunDirection;
  const y = Math.max(state.sunDirection[1], MIN_LIGHT_Y);
  const len = Math.hypot(x, y, z);
  return { ...lookAt(state, time, cycle), dayPhase: state.phase, light: [x / len, y / len, z / len] };
};

/**
 * How strongly the main light's shadows show: full whenever it shines, low sun and the night stand-in
 * included, and none (no map to draw) when it is out. A weaker shadow passes the rest of the light
 * through whatever the map blocks and would light a sealed room's sun-facing walls; a sealed room
 * stays dark at every hour.
 */
export const sunShadowStrength = (lightIntensity: number): number => (lightIntensity > 0 ? 1 : 0);
