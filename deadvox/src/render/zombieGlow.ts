// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import type { GlowMaterial } from '@mobgen/core/body.ts';
import type { ZombieDef } from '../core/schema.ts';
import { acidSpitWindupProgress, type Zombie } from '../core/zombies.ts';

export type GlowLevels = Readonly<Record<GlowMaterial, number>>;

export const UNLIT: GlowLevels = { eye: 0, acid: 0 };

/** The acid's level at a share of the spit's wind-up, so the sac telegraphs the spit (`docs/acid-zombie.md`, "The spit"). */
export const acidGlowLevel = (acid: NonNullable<ZombieDef['glow']>['acid'], progress: number): number =>
  acid.idle + (acid.windup - acid.idle) * progress;

/** A live zombie's glow this frame. Reads simulation state only; nothing here feeds back into it. */
export const zombieGlow = (zombie: Zombie): GlowLevels => {
  const { glow } = zombie.type;
  return glow ? { eye: glow.eye, acid: acidGlowLevel(glow.acid, acidSpitWindupProgress(zombie)) } : UNLIT;
};
