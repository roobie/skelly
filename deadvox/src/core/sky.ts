// Sun position, sky colour, light and fog by time of day. Pure numbers; the renderer
// applies them (render/sky.ts). The palette is muted (DESIGN.md, "Rendering"), and
// nights are dark: the flashlight arrives in milestone 1.6, and the values are tuned
// with it.

import type { Vec3 } from './coords.ts';

/** sRGB in [0, 1], as in CSS hex colours. */
export type Rgb = readonly [number, number, number];

export interface Sky {
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
}

type Look = Omit<Sky, 'light'>;

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
};

/** Keyframes by hour; the look is interpolated between them and wraps at midnight. */
const KEYS: readonly (readonly [number, Look])[] = [
  [5, NIGHT],
  [6.5, DAWN],
  [8.5, DAY],
  [17.5, DAY],
  [19.5, DUSK],
  [21, NIGHT],
];

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

const lookAt = (hour: number): Look => {
  const n = KEYS.length;
  for (let i = 0; i < n; i++) {
    const [h0, a] = KEYS[i]!;
    const [h1raw, b] = KEYS[(i + 1) % n]!;
    const h1 = h1raw > h0 ? h1raw : h1raw + 24;
    const h = hour >= h0 ? hour : hour + 24;
    if (h >= h0 && h < h1) {
      const t = (h - h0) / (h1 - h0);
      return {
        sky: mixRgb(a.sky, b.sky, t),
        lightColor: mixRgb(a.lightColor, b.lightColor, t),
        lightIntensity: mix(a.lightIntensity, b.lightIntensity, t),
        ambientSky: mixRgb(a.ambientSky, b.ambientSky, t),
        ambientGround: mixRgb(a.ambientGround, b.ambientGround, t),
        ambientIntensity: mix(a.ambientIntensity, b.ambientIntensity, t),
        fogNear: mix(a.fogNear, b.fogNear, t),
        fogFar: mix(a.fogFar, b.fogFar, t),
      };
    }
  }
  return NIGHT;
};

/** How far the sun's path tilts towards the south (−z), so noon light isn't straight down. */
const TILT = 0.35;

/**
 * Unit vector towards the sun. It rises in the east (+x) at 06:00, is highest at
 * 12:00 and sets in the west at 18:00; at night it's below the horizon.
 */
export const sunDirection = (hour: number): Vec3 => {
  const angle = ((hour - 6) / 12) * Math.PI;
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const len = Math.hypot(x, y, TILT);
  return [x / len, y / len, -TILT / len];
};

/** Lowest elevation of the main light, so it never grazes the ground at sunrise and sunset. */
const MIN_LIGHT_Y = 0.2;

/** The sky, light and fog at an hour of the day in [0, 24). */
export const skyAt = (hour: number): Sky => {
  const sun = sunDirection(hour);
  // By night the moon lights the scene from the opposite side of the sky.
  const dir: Vec3 = sun[1] >= 0 ? sun : [-sun[0], -sun[1], sun[2]];
  const y = Math.max(dir[1], MIN_LIGHT_Y);
  const len = Math.hypot(dir[0], y, dir[2]);
  return { ...lookAt(hour), light: [dir[0] / len, y / len, dir[2] / len] };
};

/** The daytime look, for the benchmark. */
export const DAY_SKY: Sky = skyAt(12);
