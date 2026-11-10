// The sky-dome selector for the issue #1505 spikes. The default is no dome (the flat fog
// background of render/sky.ts, applySky); the probe picks a spike to eyeball, e.g. the hash
// `#sky:layers`. The styles are presentation-only probes (render/playView.ts, ViewProbes).

import type { skyAt } from '@skelly/engine/sky';
import type { Scene, WebGLRenderer } from 'three';
import type { SkyDome } from './skyDome.ts';
import { createLayeredSkyDome } from './skyLayers.ts';
import { createPanoSkyDome } from './skyPano.ts';
import { createScatterSkyDome } from './skyScatter.ts';

export type SkyStyle = 'scatter' | 'layers' | 'pano';

/** The probe's value, or undefined for the default flat background. */
export const skyStyleFromProbe = (value: string | undefined): SkyStyle | undefined =>
  value === 'scatter' || value === 'layers' || value === 'pano' ? value : undefined;

/** Builds the chosen dome, adds it to the scene, and removes it again on dispose. */
export const createSkyDome = (
  style: SkyStyle | undefined,
  scene: Scene,
  renderer: WebGLRenderer,
  dayCycle: Parameters<typeof skyAt>[1],
): SkyDome | undefined => {
  let dome: SkyDome | undefined;
  if (style === 'scatter') {
    dome = createScatterSkyDome();
  } else if (style === 'layers') {
    dome = createLayeredSkyDome();
  } else if (style === 'pano') {
    dome = createPanoSkyDome(renderer, dayCycle);
  }
  if (dome === undefined) {
    return undefined;
  }
  scene.add(dome.mesh);
  return {
    ...dome,
    dispose(): void {
      scene.remove(dome.mesh);
      dome.dispose();
    },
  };
};
