import type { Camera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const createOrbitControls = (camera: Camera, element: HTMLElement): OrbitControls => {
  const controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  return controls;
};
