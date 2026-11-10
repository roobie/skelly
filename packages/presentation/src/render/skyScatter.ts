// Sky spike "scatter" for issue #1505: three's Preetham scattering dome (the `Sky` addon
// object), whose r186 shader already carries procedural FBM clouds and a sun disc. Patched to
// fade into the fog at the horizon, dim by diffuse sky visibility, and add the shared stars
// and a moon. All uniforms derive from the keyed sky (engine/core/sky.ts, skyAt), so the day
// cycle's content still owns the look. The pano spike (render/skyPano.ts) reuses this dome,
// with the sun disc off, as its bake source.

import type { Sky as SkyLook } from '@skelly/engine/sky';
import { Color, type Mesh, type ShaderMaterial, Vector3 } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import {
  DOME_GLSL,
  type DomeOutputUniforms,
  domeMesh,
  domeOutputUniforms,
  placeDome,
  type SkyDome,
  type SkyDomeFrame,
  setDomeFog,
  starWeightOf,
} from './skyDome.ts';

/** Dome uniforms the patch adds on top of the addon's own. */
interface PatchUniforms extends DomeOutputUniforms {
  uExposure: { value: number };
  uMoonDir: { value: Vector3 };
  uMoonColor: { value: Color };
  uStarWeight: { value: number };
}

/** Replaces one line of the addon's shader, throwing if three changed it (like render/distanceFog.ts). */
const patched = (shader: string, from: string, to: string): string => {
  if (!shader.includes(from)) {
    throw new Error(`skyScatter: "${from}" not found in three's Sky shader`);
  }
  return shader.replace(from, to);
};

/** The scatter dome without scene ownership, so the pano bake can drive it standalone. */
export interface ScatterDome {
  readonly mesh: Mesh;
  /** The shared dome-output uniforms, for fog and visibility. */
  readonly output: DomeOutputUniforms;
  /** Sets sun, atmosphere and cloud uniforms from the keyed sky. */
  applyLook: (sky: SkyLook, time: number) => void;
  dispose: () => void;
}

const between = (low: number, high: number, weight: number): number => low + (high - low) * weight;

export const createScatterDome = ({ sunDisc, fogBlend }: { sunDisc: boolean; fogBlend: boolean }): ScatterDome => {
  const dome = new Sky();
  const material = dome.material as ShaderMaterial;
  dome.geometry.dispose();
  // Drawn like the flat background it replaces (render/skyDome.ts).
  material.toneMapped = false;
  // The patch: declare the extra uniforms, then compose the addon's `texColor` with the
  // shared stars, moon and dome output before the addon's own colour-space chunk.
  const declared = patched(
    material.fragmentShader,
    'uniform float mieDirectionalG;',
    `uniform float mieDirectionalG;
      uniform float uExposure;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonColor;
      uniform float uStarWeight;
      ${DOME_GLSL}`,
  );
  material.fragmentShader = patched(
    declared,
    'gl_FragColor = vec4( texColor, 1.0 );',
    `vec3 domeDir = normalize( vWorldPosition - cameraPosition );
      vec3 scatterOut = texColor * uExposure;
      scatterOut += domeStars( domeDir, uStarWeight );
      scatterOut += domeSun( domeDir, uMoonDir, uMoonColor, 0.35 );
      gl_FragColor = domeOutput( scatterOut, domeDir );`,
  );
  const uniforms = material.uniforms as unknown as Record<string, { value: unknown }>;
  const patch: PatchUniforms = {
    ...domeOutputUniforms(),
    uExposure: { value: 0.35 },
    uMoonDir: { value: new Vector3(0, -1, 0) },
    uMoonColor: { value: new Color(0.7, 0.75, 0.85) },
    uStarWeight: { value: 0 },
  };
  patch.uFogBlend.value = fogBlend ? 1 : 0;
  for (const [name, uniform] of Object.entries(patch)) {
    uniforms[name] = uniform;
  }
  material.uniforms.showSunDisc!.value = sunDisc ? 1 : 0;
  const mesh = domeMesh(material);
  const sunPosition = uniforms.sunPosition!.value as Vector3;
  return {
    mesh,
    output: patch,
    applyLook(sky: SkyLook, time: number): void {
      sunPosition.set(...sky.sunDirection);
      // The lower the sun, the hazier and redder the air and the thicker the clouds.
      const low = 1 - Math.min(1, Math.max(0, sky.sunDirection[1] / 0.35));
      material.uniforms.turbidity!.value = between(3, 8, low);
      material.uniforms.rayleigh!.value = between(1.3, 3.2, low);
      material.uniforms.mieCoefficient!.value = between(0.005, 0.014, low);
      material.uniforms.mieDirectionalG!.value = between(0.8, 0.86, low);
      material.uniforms.cloudCoverage!.value = between(0.3, 0.55, low);
      material.uniforms.cloudDensity!.value = 0.4;
      material.uniforms.cloudElevation!.value = 0.5;
      material.uniforms.time!.value = time;
    },
    dispose(): void {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
};

/** The scatter spike wired for the live scene. */
export const createScatterSkyDome = (): SkyDome => {
  const scatter = createScatterDome({ sunDisc: true, fogBlend: true });
  const { uniforms } = scatter.mesh.material as ShaderMaterial;
  return {
    mesh: scatter.mesh,
    update({ sky, simSeconds, camera, skyVisibility }: SkyDomeFrame): void {
      scatter.applyLook(sky, simSeconds);
      setDomeFog(scatter.output, sky, skyVisibility);
      uniforms.uStarWeight!.value = starWeightOf(sky);
      (uniforms.uMoonDir!.value as Vector3).set(-sky.sunDirection[0], -sky.sunDirection[1], -sky.sunDirection[2]);
      placeDome(scatter.mesh, camera);
    },
    setHidden(hidden: boolean): void {
      scatter.mesh.visible = !hidden;
    },
    dispose: scatter.dispose,
  };
};
