import {
  type Mesh,
  OrthographicCamera,
  PlaneGeometry,
  SpotLight,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import type { Vec3 } from '../../src/core/coords.ts';
import { skyFixture } from '../fixtures/sky.ts';

/** A closed roof opening must shelter beam receivers even though the unfurnished field sees daylight. */
export function beamDaylightProof() {
  const fixture = skyFixture();
  fixture.world.setBlock(8, 9, 8, 0);
  fixture.entities.add({ type: 'fixture_door', pos: [8, 9, 8], size: [1, 1, 1], facing: 'n' });
  const point: Vec3 = [8.5, 8, 8.5];
  const surface = fixture.scene.children[0] as Mesh;
  surface.geometry.dispose();
  surface.geometry = new PlaneGeometry(0.5, 0.5);
  surface.position.set(...point);
  const camera = new OrthographicCamera(-0.25, 0.25, 0.25, -0.25, 0.1, 5);
  camera.position.copy(surface.position).add(new Vector3(0, 0, 2));
  camera.lookAt(surface.position);
  const beam = new SpotLight(0xff_ff_ff, 4, 5, Math.PI / 4, 0, 1);
  beam.position.copy(camera.position);
  beam.target.position.copy(surface.position);
  fixture.scene.add(beam, beam.target);
  const renderer = new WebGLRenderer();
  const target = new WebGLRenderTarget(8, 8);
  const pixels = new Uint8Array(8 * 8 * 4);
  const sample = (daylight: number, intensity = 4) => {
    fixture.sky.setDaylight({ lightIntensity: daylight, ambientIntensity: 0 });
    beam.intensity = intensity;
    renderer.setRenderTarget(target);
    renderer.render(fixture.scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 8, 8, pixels);
    return Array.from({ length: 64 }, (_, i) => pixels[i * 4]! + pixels[i * 4 + 1]! + pixels[i * 4 + 2]!);
  };
  try {
    fixture.update(point);
    fixture.complete();
    fixture.update(point);
    if (fixture.sky.at(point) !== 0 || !(fixture.sky.at(point, 'unfurnished') > 0)) {
      throw new Error('Closed roof fixture must block actual sky but admit unfurnished sky');
    }
    const night = sample(0);
    const day = sample(6);
    const dark = sample(6, 0);
    if (!(night.every((value) => value > 0) && dark.every((value) => value === 0))) {
      throw new Error('Beam control must illuminate every receiver texel and leave it dark when off');
    }
    if (!day.every((value, i) => value >= night[i]! * 0.95)) {
      throw new Error(`Closed roof must shelter the beam from daylight fade: day=${day}, night=${night}`);
    }
    return { day: Math.min(...day), night: Math.min(...night), dark: Math.max(...dark) };
  } finally {
    surface.geometry.dispose();
    fixture.material.dispose();
    fixture.sky.dispose();
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
