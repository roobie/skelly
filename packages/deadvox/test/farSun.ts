import {
  DirectionalLight,
  type Mesh,
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import type { Vec3 } from '../src/core/coords.ts';
import { skyFixture } from './fixtures/sky.ts';
import { fixtureBox } from './fixtures/skyWorld.ts';

/** Runs the production material and sky metadata on WebGL, before and after a field is built. */
export function farSunProof() {
  const fixture = skyFixture();
  const renderer = new WebGLRenderer();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const target = new WebGLRenderTarget(16, 16);
  const surface = fixture.scene.children[0] as Mesh;
  surface.geometry.dispose();
  surface.geometry = new PlaneGeometry(1, 1);
  surface.receiveShadow = true;
  const light = new DirectionalLight(0xff_ff_ff, 1);
  light.castShadow = true;
  light.shadow.mapSize.set(32, 32);
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = 10;
  fixture.scene.add(light, light.target);
  const camera = new OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
  const point = fixtureBox.min.map((value, axis) => (value + fixtureBox.max[axis]!) / 2) as Vec3;
  const pixel = new Uint8Array(4);
  const sample = (position: Vec3, covered: boolean): number => {
    surface.position.set(...position);
    camera.position.copy(surface.position).add(new Vector3(0, 0, 2));
    camera.lookAt(surface.position);
    light.position.copy(surface.position).add(new Vector3(0, 0, 3));
    light.target.position.copy(surface.position);
    Object.assign(light.shadow.camera, { left: covered ? -1 : 1, right: 3, bottom: -1, top: 1 });
    light.shadow.camera.updateProjectionMatrix();
    fixture.update(position);
    renderer.setRenderTarget(target);
    renderer.render(fixture.scene, camera);
    renderer.readRenderTargetPixels(target, 8, 8, 1, 1, pixel);
    return pixel[0]! + pixel[1]! + pixel[2]!;
  };
  try {
    const unknownFar = sample(point, false);
    const nearUnknown = sample(point, true);
    if (fixture.sky.at(point) !== 1) {
      throw new Error('A field with no result to draw yet must fall back to open sky in the view');
    }
    fixture.complete();
    fixture.update(point);
    if (fixture.sky.at(point) !== 0) {
      throw new Error('Sealed fixture must have zero diffuse sky after publication');
    }
    const zeroFar = sample(point, false);
    const nearZero = sample(point, true);
    const exposed: Vec3 = [point[0], fixtureBox.max[1] + 0.5, point[2]];
    const nonzeroFar = sample(exposed, false);
    if (!(fixture.sky.at(exposed) > 0)) {
      throw new Error('Exposed fixture must have nonzero diffuse sky');
    }
    if (zeroFar !== 0) {
      throw new Error(`Far receivers with zero sky must get no sun: ${zeroFar}`);
    }
    if (!(nonzeroFar > 0 && unknownFar > 0)) {
      throw new Error(`Far receivers with nonzero or unbuilt sky must keep direct sun: ${nonzeroFar}, ${unknownFar}`);
    }
    if (!(nearUnknown > 0 && nearZero === nearUnknown)) {
      throw new Error(`Near-map direct sun must ignore the far sky rule: ${nearUnknown}, ${nearZero}`);
    }
    return { unknownFar, zeroFar, nonzeroFar, nearUnknown, nearZero };
  } finally {
    surface.geometry.dispose();
    fixture.material.dispose();
    fixture.sky.dispose();
    light.shadow.dispose();
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
