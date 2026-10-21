import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createOrbitControls } from './orbit.ts';

export const createPreview = (canvas: HTMLCanvasElement) => {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(globalThis.devicePixelRatio);
  const scene = new Scene();
  scene.background = new Color(0x20_25_2b);
  scene.add(new AmbientLight(0xff_ff_ff, 2));
  const light = new DirectionalLight(0xff_ff_ff, 3);
  light.position.set(1, 2, 3);
  scene.add(light, new GridHelper(1, 20, 0x59_62_6d, 0x34_3d_48));
  const camera = new PerspectiveCamera(40, 1, 0.0001, 100);
  const controls = createOrbitControls(camera, canvas);
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  const frame = (object: Object3D, centre?: readonly [number, number, number]) => {
    const bounds = new Box3().setFromObject(object);
    const target = centre ? new Vector3(...centre) : bounds.getCenter(new Vector3());
    const distance = bounds.getSize(new Vector3()).length() / Math.sin((camera.fov * Math.PI) / 360);
    controls.target.copy(target);
    camera.position.copy(target).add(new Vector3(1, 0.7, 1).normalize().multiplyScalar(distance));
    camera.near = distance / 1000;
    camera.far = distance * 1000;
    camera.updateProjectionMatrix();
    controls.update();
  };
  return { scene, frame };
};
