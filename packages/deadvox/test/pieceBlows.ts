import type { Registry } from '@skelly/engine/content';
import type { Blow } from '@skelly/engine/internal/core/blow.ts';

/**
 * A blunt blow that lands `strength` on a piece of `type` after its material's blunt resistance, so a test that needs
 * a breach or a ruin keeps it whatever the material is tuned to resist.
 */
export const bluntBlowLanding = (registry: Registry, type: string, strength: number): Blow => {
  const material = registry.furnitureMaterials.get(registry.furniture.get(type)!.material)!;
  const passes = 1 - material.resistance.blunt!;
  if (passes <= 0) {
    throw new Error(`Material "${material.id}" resists blunt blows whole`);
  }
  let struck = strength / passes;
  // Division can round below the target, and a gate at exactly `strength` must still admit the blow.
  while (struck * passes < strength) {
    struck += struck * Number.EPSILON;
  }
  return { strength: struck, kind: 'blunt' };
};

/** Makes the material of pieces of `type` resist crushing whole in a registry the caller owns. */
export const crushProof = (registry: Registry, type: string): Registry => {
  const id = registry.furniture.get(type)!.material;
  const material = registry.furnitureMaterials.get(id)!;
  registry.furnitureMaterials.set(id, { ...material, resistance: { ...material.resistance, crush: 1 } });
  return registry;
};
