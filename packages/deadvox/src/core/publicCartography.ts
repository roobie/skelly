import type { Rect } from './site.ts';

/** Public paths deliberately published by a generation owner, never inferred from generated blocks. */
interface PublicRoad {
  readonly kind: 'road';
  readonly bounds: Rect;
}

/** A public route described by its centre line and its printed width, in metres. */
interface PublicTrack {
  readonly kind: 'track';
  readonly points: readonly (readonly [number, number])[];
  readonly width: number;
}

export type PublicCartographicFeature = PublicRoad | PublicTrack;
