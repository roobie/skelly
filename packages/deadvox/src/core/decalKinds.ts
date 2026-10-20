/** Closed presentation dispatch; definitions own the appearance of each kind. */
export const DECAL_KINDS = { blood: 'stain', scorch: 'stain', paint: 'strokes' } as const;
export type DecalKind = keyof typeof DECAL_KINDS;
