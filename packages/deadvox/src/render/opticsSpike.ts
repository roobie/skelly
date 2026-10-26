import type { PerspectiveCamera, Scene } from 'three';
import type { ModelDef } from '../core/content.ts';
import { opticWindowDistance } from '../core/opticWindow.ts';
import type { HeldItems } from './hands.ts';

export type OpticsSpike = 'effect' | 'world';
export type OpticsEye = 'fill' | 'relief';
export type OpticsTube = 'disc' | 'cups' | 'split' | 'none';

export const opticsTubePresentation = (tube: OpticsTube, magnification: number) => ({
  worldAtUnity: tube === 'disc' || (tube === 'split' && magnification === 1),
  cups: tube === 'cups' || (tube === 'split' && magnification > 1),
});

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
    const eye: OpticsEye =
      mode === 'world' && new URLSearchParams(globalThis.location?.search ?? '').get('eye') === 'relief'
        ? 'relief'
        : 'fill';
    const requested = new URLSearchParams(globalThis.location?.search ?? '').get('tube');
    const tube: OpticsTube =
      mode === 'world' && (requested === 'disc' || requested === 'cups' || requested === 'split') ? requested : 'none';
    held.configureOpticsSpike(scene, mode, eye, tube);
    camera.layers.enable(OPTICS_SPIKE_LAYER);
    camera.near = 0.01;
    camera.updateProjectionMatrix();
  }
  return mode;
};

export const opticsEyeDistance = (
  eye: OpticsEye,
  sight: NonNullable<ModelDef['gun']>['sight'],
  fill: number | undefined,
  fov: number,
): number | undefined => {
  if (eye === 'relief') {
    return sight?.eyeReliefMetres;
  }
  return sight?.ocularDiameterMetres !== undefined && fill !== undefined
    ? opticWindowDistance(sight.ocularDiameterMetres, fill, fov)
    : undefined;
};

// The magnified scene must not magnify the close-eye gun or worn gear a second time.
export const OPTICS_SPIKE_LAYER = 2;
