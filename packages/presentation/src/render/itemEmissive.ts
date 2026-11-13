import type { ColorRepresentation, MeshStandardMaterial } from 'three';

/** A copy glowing past the tone mapper; shader warm-up builds the same copy as item state presentation. */
export const glowingCopy = (
  material: MeshStandardMaterial,
  color: ColorRepresentation,
  intensity: number,
): MeshStandardMaterial => {
  const glowing = material.clone();
  glowing.emissive.set(color);
  glowing.emissiveIntensity = intensity;
  glowing.toneMapped = false;
  return glowing;
};
