import type { Vec3 } from './coords.ts';

/** A view-only account of one discrete gravity move; records never enter saves. */
export type FallRecord = {
  readonly from: Vec3;
  readonly to: Vec3;
} & ({ readonly kind: 'piece' | 'pile'; readonly uid: number } | { readonly kind: 'terrain'; readonly block: number });
