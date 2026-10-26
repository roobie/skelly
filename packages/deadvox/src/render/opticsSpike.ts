import type { PerspectiveCamera, Scene } from 'three';
import type { HeldItems } from './hands.ts';

export type OpticsSpike = 'effect' | 'world';

const opticsSpikeFromSearch = (search: string): OpticsSpike | undefined => {
  const choice = new URLSearchParams(search).get('optics');
  return choice === 'effect' || choice === 'world' ? choice : undefined;
};

export const configureOpticsSpike = (
  held: HeldItems,
  scene: Scene,
  camera: PerspectiveCamera,
): OpticsSpike | undefined => {
  const mode = opticsSpikeFromSearch(globalThis.location?.search ?? '');
  if (mode) {
    held.configureOpticsSpike(scene, mode);
    camera.layers.enable(OPTICS_SPIKE_LAYER);
    camera.near = 0.01;
    camera.updateProjectionMatrix();
  }
  return mode;
};

// The magnified scene must not magnify the close-eye gun or worn gear a second time.
export const OPTICS_SPIKE_LAYER = 2;
