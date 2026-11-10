// The player's stances, kept free of imports so plain-node save tooling can load them.

export const PLAYER_STANCES = ['standing', 'crouching', 'prone'] as const;
export type PlayerStance = (typeof PLAYER_STANCES)[number];
