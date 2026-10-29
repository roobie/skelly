import basePlayer from '../content/base/player.json' with { type: 'json' };

/** Core-pack gravity for tools and isolated presentation fixtures without a registry. */
export const DEFAULT_WORLD_GRAVITY = basePlayer.player[0]!.gravityMetresPerSimSecondSquared;
