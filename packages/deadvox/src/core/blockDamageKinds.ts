export const BLOCK_DAMAGE_KINDS = ['blunt', 'cut', 'pierce', 'blast', 'fragment', 'breach', 'crush'] as const;
export type BlockDamageKind = (typeof BLOCK_DAMAGE_KINDS)[number];
