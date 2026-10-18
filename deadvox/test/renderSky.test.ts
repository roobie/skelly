import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  type WebGLRenderer,
} from 'three';
import { expect, it } from 'vitest';
import graphicsFile from '../src/content/base/graphics.json' with { type: 'json' };
import { skyAt } from '../src/core/sky.ts';
import { heightFogUniforms } from '../src/render/heightFog.ts';
import { Mood } from '../src/render/mood.ts';
import { applySky } from '../src/render/sky.ts';
import { BASE_DAY_CYCLE } from './dayPhaseFixture.ts';

it('fog, background and mist follow local sky visibility from darkness to open sky', () => {
  const scene = new Scene();
  const targets = {
    scene,
    light: new DirectionalLight(),
    ambient: new HemisphereLight(),
    camera: new PerspectiveCamera(),
    radiusM: 100,
  };
  const mood = new Mood(
    { domElement: new EventTarget() } as unknown as WebGLRenderer,
    scene,
    targets.camera,
    graphicsFile.graphics[0]!,
  );
  const sky = {
    ...skyAt(12, BASE_DAY_CYCLE),
    sky: [0.6, 0.7, 0.8] as const,
    heightFogColor: [0.4, 0.5, 0.6] as const,
  };
  const outdoorFog = new Color().setRGB(...sky.sky, SRGBColorSpace);
  const outdoorMist = new Color().setRGB(...sky.heightFogColor, SRGBColorSpace);
  for (const visibility of [0, 0.5, 1]) {
    applySky(targets, sky, visibility);
    mood.setSky(sky, visibility);
    expect(scene.fog).toBeInstanceOf(Fog);
    const fog = scene.fog as Fog;
    expect(fog.color.toArray()).toEqual(outdoorFog.clone().multiplyScalar(visibility).toArray());
    expect(scene.background).toBe(fog.color);
    expect(heightFogUniforms.uHeightFogColor.value.toArray()).toEqual(
      outdoorMist.clone().multiplyScalar(visibility).toArray(),
    );
    expect(targets.light.intensity).toBe(sky.lightIntensity);
    expect(targets.ambient.intensity).toBe(sky.ambientIntensity);
  }
});
