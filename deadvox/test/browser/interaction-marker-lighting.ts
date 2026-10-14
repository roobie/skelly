import {
  AmbientLight,
  BoxGeometry,
  Color,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SpotLight,
  SRGBColorSpace,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { FurnitureMeshes } from '../../src/render/furniture.ts';

/** Owned pixels isolate the selected marker from HUD and unrelated world geometry. */
export function interactionMarkerLightingProof() {
  const renderer = new WebGLRenderer();
  const target = new WebGLRenderTarget(96, 96);
  target.texture.colorSpace = SRGBColorSpace;
  const camera = new PerspectiveCamera(50, 1, 0.1, 20);
  camera.position.set(2, 1.5, 3);
  camera.lookAt(0, 0, 0);
  const scene = new Scene();
  scene.background = new Color('black');
  const furniture = new FurnitureMeshes(1);
  furniture.markBounds('lighting-fixture', [0, 0, 0], [1, 1, 1]);
  scene.add(furniture.group);
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial({ color: '#ffe36e' });
  const surface = new Mesh(geometry, material);
  scene.add(surface);
  const ambient = new AmbientLight('#1c2330', 0.1);
  scene.add(ambient);
  const lamp = new PointLight('white', 12, 10);
  lamp.position.set(2, 2, 2);
  const flashlight = new SpotLight('white', 12, 10, Math.PI / 4);
  flashlight.position.copy(camera.position);
  flashlight.target.position.set(0, 0, 0);
  scene.add(flashlight.target);
  const pixels = new Uint8Array(96 * 96 * 4);
  const read = (showMarker: boolean) => {
    furniture.group.visible = showMarker;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 96, 96, pixels);
    return new Uint8Array(pixels);
  };
  const sample = () => {
    const without = read(false);
    const withMarker = read(true);
    let marker = 0;
    let surfacePeak = 0;
    let changed = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const base = without[i]! + without[i + 1]! + without[i + 2]!;
      const marked = withMarker[i]! + withMarker[i + 1]! + withMarker[i + 2]!;
      surfacePeak = Math.max(surfacePeak, base);
      if (marked > base) {
        marker = Math.max(marker, marked);
        changed += 1;
      }
    }
    return { marker, surface: surfacePeak, changed };
  };
  try {
    const night = sample();
    scene.add(lamp);
    const lampLit = sample();
    scene.remove(lamp);
    scene.add(flashlight);
    const flashlightLit = sample();
    scene.remove(flashlight, ambient);
    const dark = sample();
    return { night, lampLit, flashlightLit, dark };
  } finally {
    geometry.dispose();
    material.dispose();
    furniture.group.traverse((object) => {
      if ('geometry' in object) {
        (object.geometry as BoxGeometry).dispose();
      }
      if ('material' in object) {
        (object.material as MeshLambertMaterial).dispose();
      }
    });
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
