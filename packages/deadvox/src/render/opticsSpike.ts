import type { PerspectiveCamera, Scene } from 'three';
import type { ModelDef } from '../core/content.ts';
import { opticWindowDistance } from '../core/opticWindow.ts';
import type { HeldItems } from './hands.ts';

export type OpticsSpike = 'effect' | 'world';
export type OpticsEye = 'fill' | 'relief';
export type OpticsTube = 'disc' | 'none';

export const defaultOpticsTube = (mode: OpticsSpike | undefined): OpticsTube => (mode === 'world' ? 'disc' : 'none');

const opticsSpikeFromSearch = (search: string): OpticsSpike => {
  const choice = new URLSearchParams(search).get('optics');
  return choice === 'effect' ? 'effect' : 'world';
};

export const configureOpticsSpike = (held: HeldItems, scene: Scene, camera: PerspectiveCamera): OpticsSpike => {
  const search = new URLSearchParams(globalThis.location?.search ?? '');
  const mode = opticsSpikeFromSearch(search.toString());
  const eye: OpticsEye = mode === 'world' && search.get('eye') !== 'fill' ? 'relief' : 'fill';
  const requested = search.get('tube');
  const tube: OpticsTube | undefined =
    mode === 'world' && (requested === 'disc' || requested === 'none') ? requested : undefined;
  held.configureOpticsSpike(scene, mode, eye, tube);
  camera.layers.enable(OPTICS_SPIKE_LAYER);
  camera.layers.enable(OPTIC_BODY_LAYER);
  camera.near = 0.01;
  camera.updateProjectionMatrix();
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
// Unity images retain the gun but must not copy the active optic back into its own window.
export const OPTIC_BODY_LAYER = 3;
