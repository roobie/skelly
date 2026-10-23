import { BoxGeometry, Mesh, MeshLambertMaterial, Scene } from 'three';
import type { Vec3 } from '../../src/core/coords.ts';
import { graphicsTuningOf } from '../../src/core/graphicsTuning.ts';
import { SkyFields } from '../../src/core/skyField.ts';
import type { SkyBounds } from '../../src/core/skylight.ts';
import { type CapturedSky, captureSky, growSky, SKY_SHELL, type SkySnapshot } from '../../src/core/skySnapshot.ts';
import { buildSkyResult, type SkyResult } from '../../src/core/skyTransport.ts';
import { Skylight } from '../../src/render/skylight.ts';
import { fixtureBox, skyWorldFixture } from './skyWorld.ts';

export function skyFixture(boxes: SkyBounds[] = [fixtureBox], clock = () => 0) {
  const owner = skyWorldFixture(boxes);
  const pending: { input: SkySnapshot; receive: (result: SkyResult, ms: number) => void }[] = [];
  const fields = new SkyFields(owner, { bottom: 0, top: 31 }, boxes);
  const { unbuiltSkyCap } = graphicsTuningOf(owner.registry);
  const sky = new Skylight(
    fields,
    { blockSize: 1, viewRadiusM: 160, unbuiltCap: unbuiltSkyCap },
    {
      clock,
      submit: (input, receive) => {
        pending.push({ input, receive });
        return true;
      },
    },
  );
  const scene = new Scene();
  const material = new MeshLambertMaterial();
  scene.add(new Mesh(new BoxGeometry(), material));
  const update = (position: Vec3 = [8, 4, 8]) => sky.update(scene, position);
  const complete = () => {
    const job = pending.shift();
    if (!job) {
      throw new Error('No owned sky job to complete');
    }
    const transferred = structuredClone(job.input, {
      transfer: job.input.chunks.flatMap((chunk) => (chunk.raw ? [chunk.raw.buffer as ArrayBuffer] : [])),
    });
    job.receive(buildSkyResult(transferred), 0);
  };
  const capture = (bounds = growSky(boxes[0]!, SKY_SHELL)): CapturedSky => {
    const iterator = captureSky(owner, bounds, { bottom: 0, top: 31 });
    let next = iterator.next();
    while (!next.done) {
      next = iterator.next();
    }
    return next.value;
  };
  const shader = () => {
    const result = {
      uniforms: {} as Parameters<typeof material.onBeforeCompile>[0]['uniforms'],
      vertexShader: '#include <common>\n#include <worldpos_vertex>',
      fragmentShader: '#include <common>\n#include <lights_fragment_end>',
    };
    material.onBeforeCompile(result as never, null as never);
    return result;
  };
  return { ...owner, fields, sky, unbuiltSkyCap, pending, scene, material, update, complete, capture, shader };
}
