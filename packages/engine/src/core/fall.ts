import type { Vec3 } from './coords.ts';

/** A view-only account of one discrete gravity move; records never enter saves. */
export interface FallRecord {
  readonly kind: 'piece' | 'pile' | 'terrain';
  readonly from: Vec3;
  readonly to: Vec3;
  /** The standing piece for `piece`, or the piled item's uid for `pile`. */
  readonly uid?: number;
}
