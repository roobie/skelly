// biome-ignore-all lint/performance/noAwaitInLoops: each GPU fixture is disposed before loading the next optic
import { opticApertureDistance } from '@skelly/thing-core/optic-aperture';
import { reticleScale } from '@skelly/thing-core/reticle';
import {
  AmbientLight,
  Box3,
  Color,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { projectLensAperture } from '../../src/core/opticView.ts';
import { OpticLensRenderer, opticLensPass, setOpticLensUniforms } from '../../src/render/opticLens.ts';
import { OPTIC_BODY_LAYER } from '../../src/render/opticsSpike.ts';

function* aperturePixels(frame, size) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const uv = [(x + 0.5) / size, (y + 0.5) / size];
      const local = [(uv[0] - frame.center[0]) / frame.radius[0], (uv[1] - frame.center[1]) / frame.radius[1]];
      if (opticApertureDistance(...local, frame.aperture) < 0.9) {
        yield { uv, index: (y * size + x) * 4 };
      }
    }
  }
}

const opaqueHit = (ray, root) =>
  ray.intersectObject(root, true).some(({ object, face }) => {
    const material = Array.isArray(object.material) ? object.material[face.materialIndex] : object.material;
    return material.visible && !material.transparent;
  });

const coverage = ({ root, camera, frame, before, after, size }) => {
  const ray = new Raycaster();
  ray.layers.enable(OPTIC_BODY_LAYER);
  let housing = 0;
  let coveredHousing = 0;
  let clearWindowChanged = 0;
  for (const { uv, index } of aperturePixels(frame, size)) {
    ray.setFromCamera(new Vector2(uv[0] * 2 - 1, uv[1] * 2 - 1), camera);
    const equal = [0, 1, 2].every((channel) => before[index + channel] === after[index + channel]);
    if (opaqueHit(ray, root)) {
      housing += 1;
      coveredHousing += Number(!equal);
    } else {
      clearWindowChanged += Number(!equal);
    }
  }
  return { housing, coveredHousing, clearWindowChanged };
};

const disposeModel = (root) =>
  root.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.dispose();
    }
  });

const fixture = async (model) => {
  const loaded = await new GLTFLoader().loadAsync(`/src/content/base/${model.file}`);
  const scene = new Scene();
  scene.background = new Color(1, 0, 1);
  scene.add(new AmbientLight(0xff_ff_ff), loaded.scene);
  loaded.scene.traverse((object) => {
    if (object.isMesh) {
      object.layers.set(OPTIC_BODY_LAYER);
    }
  });
  const { sight } = model.gun.attachment;
  const eye = new Vector3(...sight.eye);
  const camera = new PerspectiveCamera(70, 1, 0.001, 10);
  camera.position.copy(eye).addScaledVector(new Vector3(...sight.direction), -sight.eyeReliefMetres);
  camera.up.set(...sight.up);
  camera.lookAt(eye);
  camera.layers.enable(OPTIC_BODY_LAYER);
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  // A fixture-owned oversized aperture forces overlap without pinning production shape or tuning.
  const sphere = new Box3().setFromObject(loaded.scene).getBoundingSphere(new Sphere());
  const projection = projectLensAperture({
    center: [0, 0, -sight.eyeReliefMetres],
    right: [1, 0, 0],
    up: [0, 1, 0],
    radius: sphere.radius + sphere.center.distanceTo(eye),
    verticalFovDegrees: camera.fov,
    aspect: camera.aspect,
  });
  if (!projection) {
    throw new Error('Need a visible housing aperture');
  }
  const frame = {
    ...projection,
    aperture: { aspectRatio: 1, exponent: 2 },
    reticleCenter: projection.center,
    magnification: 1,
    worldAtUnity: true,
    excludeSelf: true,
    border: false,
  };
  return { scene, root: loaded.scene, camera, frame };
};

const compositePixels = ({ renderer, pass, source, destination, frame, size }) => {
  setOpticLensUniforms(pass, frame);
  pass.uniforms.uLensCenter.value.set(...frame.center);
  pass.uniforms.uLensRadius.value.set(...frame.radius);
  pass.render(renderer, destination, source, 0, false);
  const pixels = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(destination, 0, 0, size, size, pixels);
  return pixels;
};

const dotVisibility = ({ model, root, camera, frame, renderer, pass, source, destination, size }) => {
  const { sight, properties } = model.gun.attachment;
  const dot = properties.reticle?.primitives.find((primitive) => primitive.kind === 'dot');
  if (!dot) {
    return {};
  }
  const projection = projectLensAperture({
    center: [0, 0, -sight.eyeReliefMetres],
    right: [1, 0, 0],
    up: [0, 1, 0],
    radius: sight.ocularDiameterMetres / 2,
    verticalFovDegrees: camera.fov,
    aspect: camera.aspect,
  });
  if (!projection) {
    throw new Error('Need a visible authored dot aperture');
  }
  const authored = { ...frame, ...projection, aperture: properties.aperture, reticleCenter: projection.center };
  const buffers = { renderer, pass, source, destination, size };
  const before = compositePixels({ ...buffers, frame: authored });
  const reticle = { ...properties.reticle, primitives: [dot] };
  const after = compositePixels({ ...buffers, frame: { ...authored, reticle } });
  const changed = coverage({ root, camera, frame: authored, before, after, size });
  const scale = reticleScale(reticle, authored.magnification);
  const uv = authored.reticleCenter.map((value, axis) => value + dot.center[axis] * authored.radius[axis] * scale);
  const ray = new Raycaster();
  ray.layers.enable(OPTIC_BODY_LAYER);
  ray.setFromCamera(new Vector2(uv[0] * 2 - 1, uv[1] * 2 - 1), camera);
  const glass = ray.intersectObject(root, true).some(({ object, face }) => {
    const material = Array.isArray(object.material) ? object.material[face.materialIndex] : object.material;
    return material.visible && material.transparent;
  });
  return {
    dotInsideWindow: glass && !opaqueHit(ray, root),
    dotVisiblePixels: changed.clearWindowChanged,
    dotCoveredHousing: changed.coveredHousing,
  };
};

const checkModel = async (model, renderer, size) => {
  const { scene, root, camera, frame } = await fixture(model);
  const source = new WebGLRenderTarget(size, size);
  const destination = new WebGLRenderTarget(size, size);
  const lens = new OpticLensRenderer();
  const pass = opticLensPass();
  try {
    renderer.setRenderTarget(source);
    renderer.render(scene, camera);
    const before = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(source, 0, 0, size, size, before);
    lens.prepare(renderer, scene, camera, frame);
    pass.uniforms.uZoomTexture.value = lens.texture;
    pass.uniforms.uHousingTexture.value = lens.housingTexture;
    pass.uniforms.uHousingActive.value = lens.housingActive ? 1 : 0;
    const buffers = { renderer, pass, source, destination, size };
    const after = compositePixels({ ...buffers, frame });
    return {
      model: model.id,
      ...coverage({ root, camera, frame, before, after, size }),
      ...dotVisibility({ ...buffers, model, root, camera, frame }),
    };
  } finally {
    source.dispose();
    destination.dispose();
    lens.dispose();
    pass.dispose();
    disposeModel(root);
  }
};

export const runOpticHousingProperty = async (registry) => {
  const optics = [...registry.models.values()].filter(
    ({ gun }) => gun?.attachment?.kind === 'optic' && (gun.attachment.properties.magnification?.max ?? 1) === 1,
  );
  if (optics.length === 0) {
    throw new Error('Need a non-magnifying optic for the housing property');
  }
  const renderer = new WebGLRenderer({ canvas: document.createElement('canvas') });
  const size = 256;
  renderer.setSize(size, size);
  const results = [];
  try {
    for (const model of optics) {
      results.push(await checkModel(model, renderer, size));
    }
  } finally {
    renderer.dispose();
  }
  return results;
};
