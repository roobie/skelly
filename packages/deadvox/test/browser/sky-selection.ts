import { Camera, Mesh, PlaneGeometry, Scene, ShaderMaterial, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { Vec3 } from '../../src/core/coords.ts';
import { growSky, SKY_HALO } from '../../src/core/skySnapshot.ts';
import { sampleSky } from '../../src/core/skyTransport.ts';
import { skyFixture } from '../fixtures/sky.ts';
import { buildSkylight } from '../fixtures/skyOracle.ts';
import { fixtureBox } from '../fixtures/skyWorld.ts';

export function runSkySelectionProof() {
  const boxes = Array.from({ length: 5 }, (_, index) => ({
    min: fixtureBox.min.map((value, axis) => value + (axis === 0 ? index * 32 : 0)) as Vec3,
    max: fixtureBox.max.map((value, axis) => value + (axis === 0 ? index * 32 : 0)) as Vec3,
  }));
  const overlap = { min: [4, 1, 4] as Vec3, max: [5, 10, 13] as Vec3 };
  const fixture = skyFixture([...boxes, overlap]);
  for (let z = 6; z <= 8; z++) {
    for (let x = 24; x <= 26; x++) {
      fixture.world.setBlock(x, 9, z, fixture.wall);
    }
  }
  const renderer = new WebGLRenderer();
  renderer.setSize(1, 1);
  const target = new WebGLRenderTarget(1, 1);
  const pixels = new Uint8Array(4);
  const witness = new Scene();
  fixture.update();
  const compiled = fixture.shader();
  const declarations = compiled.fragmentShader
    .slice(0, compiled.fragmentShader.indexOf('irradiance *='))
    .replace('#include <common>', '');
  const material = new ShaderMaterial({
    uniforms: { ...compiled.uniforms, point: { value: new Vector3() } },
    vertexShader:
      'uniform vec3 point; varying vec3 vSkyWorld; varying vec3 vSkyNormal; void main(){ vSkyWorld=point-vec3(0.0,0.5,0.0); vSkyNormal=vec3(0.0,1.0,0.0); gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: `${declarations}\nvoid main(){ bool unbuilt; gl_FragColor=vec4(vec3(skyVisibility(unbuilt).x),1.0); }`,
  });
  const geometry = new PlaneGeometry(2, 2);
  witness.add(new Mesh(geometry, material));
  const sample = (point: Vec3) => {
    material.uniforms.point!.value.set(...point);
    renderer.setRenderTarget(target);
    renderer.render(witness, new Camera());
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixels);
    return { cpu: fixture.sky.at(point), shader: pixels[0]! / 255 };
  };
  try {
    const canopy: Vec3 = [25.5, 7.5, 7.5];
    const room: Vec3 = [8.5, 4.5, 8.5];
    const oracle = buildSkylight(growSky(fixtureBox, SKY_HALO * 2), 31, fixture.knownOpaque);
    const pending = { room: sample(room), canopy: sample(canopy) };
    for (const box of boxes) {
      const position: Vec3 = [box.min[0] + 4, 4, 8];
      fixture.update(position);
      while (fixture.pending.length > 0) {
        fixture.complete();
        fixture.update(position);
      }
    }
    const evicted = { room: sample(room), canopy: sample(canopy) };
    fixture.update();
    const ready = {
      overlap: sample([5.5, 4.5, 8.5]),
      room: sample(room),
      canopy: sample(canopy),
      above: sample([room[0], fixtureBox.max[1] + 0.5, room[2]]),
    };
    fixture.world.setBlock(4, 5, 8, 0);
    fixture.update();
    const editedPending = sample([5.5, 5.5, 8.5]);
    while (fixture.pending.length > 0) {
      fixture.complete();
      fixture.update();
    }
    const editedReady = sample([5.5, 5.5, 8.5]);
    const heightTexture = compiled.uniforms.uSkyHeights!.value.image;
    const regionData = compiled.uniforms.uSkyRegions!.value.image.data;
    const canopyColumn =
      Math.floor(canopy[0]) -
      regionData[9] +
      heightTexture.width * (Math.floor(canopy[2]) - regionData[10] + regionData[8]);
    const canopyColumnHeight = heightTexture.data[canopyColumn];
    const [x0, y0, z0] = fixtureBox.min;
    for (let y = y0; y < fixtureBox.max[1]; y++) {
      for (let z = z0; z < fixtureBox.max[2]; z++) {
        for (let x = x0; x < fixtureBox.max[0]; x++) {
          fixture.world.setBlock(x, y, z, 0);
        }
      }
    }
    fixture.update();
    while (fixture.pending.length > 0) {
      fixture.complete();
      fixture.update();
    }
    const roofFree = sample(room);
    return {
      canopyColumnHeight,
      editedPending,
      editedReady,
      roofFree,
      requested: fixture.sky.stats.requested,
      completed: fixture.sky.stats.completed,
      oracleCanopy: sampleSky(oracle, canopy),
      unbuiltSkyCap: fixture.unbuiltSkyCap,
      pending,
      ready,
      evicted,
    };
  } finally {
    fixture.sky.dispose();
    geometry.dispose();
    material.dispose();
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
