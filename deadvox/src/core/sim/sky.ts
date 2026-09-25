// Light and sky colour by time of day. Pure: the renderer applies the result.

export interface Sky {
  /** Sky, fog and background colour, 0xrrggbb. */
  color: number;
  /** Direction toward the sun (unit vector; below the horizon at night). */
  sunDir: [number, number, number];
  /** Directional (sun or moon) light intensity. */
  sun: number;
  /** Hemisphere (ambient) light intensity. */
  ambient: number;
}

interface Key {
  hour: number;
  color: number;
  sun: number;
  ambient: number;
}

// Nights are dark but not black: the ambient term stands in for moonlight until
// voxel light and a flashlight exist.
const KEYS: readonly Key[] = [
  { hour: 0, color: 0x0b_10_18, sun: 0.05, ambient: 0.28 },
  { hour: 5, color: 0x1c_24_33, sun: 0.05, ambient: 0.35 },
  { hour: 6.5, color: 0xd9_9a_6c, sun: 0.6, ambient: 0.75 },
  { hour: 8, color: 0xa9_bf_d0, sun: 1.6, ambient: 1.3 },
  { hour: 17, color: 0xa9_bf_d0, sun: 1.6, ambient: 1.3 },
  { hour: 19, color: 0xd5_8a_5a, sun: 0.7, ambient: 0.8 },
  { hour: 20.5, color: 0x2a_31_40, sun: 0.1, ambient: 0.4 },
  { hour: 24, color: 0x0b_10_18, sun: 0.05, ambient: 0.28 },
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Blends two 0xrrggbb colours channel by channel. */
export const mixColor = (a: number, b: number, t: number): number => {
  let out = 0;
  for (const shift of [16, 8, 0]) {
    const channel = Math.round(lerp((a >> shift) & 0xff, (b >> shift) & 0xff, t));
    out |= channel << shift;
  }
  return out;
};

/** The sky at a time of day (hours, 0 ≤ h < 24). */
export const skyAt = (hour: number): Sky => {
  const i = Math.max(
    0,
    KEYS.findIndex((k) => k.hour > hour),
  );
  const next = KEYS[i]!;
  const prev = KEYS[Math.max(0, i - 1)]!;
  const t = next.hour === prev.hour ? 0 : (hour - prev.hour) / (next.hour - prev.hour);
  // The sun rises in the east (+x) at 06:00, peaks at noon, sets in the west at 18:00.
  // At night the same light stands in for the moon, so it stays above the horizon.
  const angle = ((hour - 6) / 12) * Math.PI;
  return {
    color: mixColor(prev.color, next.color, t),
    sunDir: [Math.cos(angle), Math.abs(Math.sin(angle)) + 0.05, 0.25],
    sun: lerp(prev.sun, next.sun, t),
    ambient: lerp(prev.ambient, next.ambient, t),
  };
};
