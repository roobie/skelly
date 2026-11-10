// Sky spike "pano" for issue #1505: the baked-panorama architecture. At startup the scatter
// dome (render/skyScatter.ts, sun disc off) is rendered into fixed half-float cube stops
// around the clock; per frame the runtime dome crossfades the two nearest stops and adds the
// shared sun, moon, stars and fog blend. Runtime cost is one cube sample; the trade the
// spike exists to eyeball: clouds and glare are frozen per stop, so they crossfade instead of
// moving, and the stops are PMREM-ready for the environment map (issue #1542).

import { skyAt } from '@skelly/engine/sky';
import {
  BackSide,
  Color,
  CubeCamera,
  HalfFloatType,
  LinearFilter,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import {
  DOME_GLSL,
  domeMesh,
  domeOutputUniforms,
  placeDome,
  type SkyDome,
  type SkyDomeFrame,
  setDomeFog,
  starWeightOf,
} from './skyDome.ts';
import { createScatterDome, type ScatterDome } from './skyScatter.ts';

const STOPS = 12;
const STOP_SIZE = 128;

const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDir;
  void main () {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vDir;
  uniform samplerCube uStopA;
  uniform samplerCube uStopB;
  uniform float uBlend;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonColor;
  uniform vec3 uMoonDir;
  uniform float uSunGlow;
  uniform float uStarWeight;
  ${DOME_GLSL}
  void main () {
    vec3 dir = normalize( vDir );
    vec3 col = mix( textureCube( uStopA, dir ).rgb, textureCube( uStopB, dir ).rgb, uBlend );
    col += domeSun( dir, uSunDir, uSunColor, uSunGlow );
    col += domeSun( dir, uMoonDir, uMoonColor, 0.3 );
    col += domeStars( dir, uStarWeight );
    gl_FragColor = domeOutput( col, dir );
    #include <colorspace_fragment>
  }
`;

const cubeStop = (): WebGLCubeRenderTarget =>
  // Half-float keeps the bakes' HDR glare for the bloom and a later PMREM (issue #1542).
  new WebGLCubeRenderTarget(STOP_SIZE, {
    type: HalfFloatType,
    generateMipmaps: false,
    minFilter: LinearFilter,
  });

/** Bakes the stops, then serves the crossfading dome. */
export const createPanoSkyDome = (renderer: WebGLRenderer, dayCycle: Parameters<typeof skyAt>[1]): SkyDome => {
  const bakeScene = new Scene();
  // Pure sky into the stops, no fog fade: the runtime dome fades into the live fog once.
  // Baked before any frame, outside Mood's chain draw, so the shared colour scale is still 1.
  const scatter: ScatterDome = createScatterDome({ sunDisc: false, fogBlend: false });
  scatter.mesh.scale.setScalar(4);
  bakeScene.add(scatter.mesh);
  const stops: WebGLCubeRenderTarget[] = [];
  for (let stop = 0; stop < STOPS; stop++) {
    const hour = (stop * 24) / STOPS;
    scatter.applyLook(skyAt(hour, dayCycle), hour * 3600);
    const target = cubeStop();
    new CubeCamera(0.1, 10, target).update(renderer, bakeScene);
    stops.push(target);
  }
  scatter.dispose();

  const output = domeOutputUniforms();
  const runtime = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      ...output,
      uStopA: { value: stops[0]!.texture },
      uStopB: { value: stops[1]!.texture },
      uBlend: { value: 0 },
      uSunColor: { value: new Color(0, 0, 0) },
      uSunDir: { value: new Vector3(0, 1, 0) },
      uMoonColor: { value: new Color(0.65, 0.7, 0.8) },
      uMoonDir: { value: new Vector3(0, -1, 0) },
      uSunGlow: { value: 0.5 },
      uStarWeight: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  const mesh = domeMesh(runtime);
  const sunColor = runtime.uniforms.uSunColor!.value as Color;
  const sunDir = runtime.uniforms.uSunDir!.value as Vector3;
  const moonDir = runtime.uniforms.uMoonDir!.value as Vector3;
  return {
    mesh,
    update({ sky, gameHour, camera, skyVisibility }: SkyDomeFrame): void {
      const position = (gameHour / 24) * STOPS;
      const first = Math.floor(position) % STOPS;
      runtime.uniforms.uStopA!.value = stops[first]!.texture;
      runtime.uniforms.uStopB!.value = stops[(first + 1) % STOPS]!.texture;
      runtime.uniforms.uBlend!.value = position - Math.floor(position);
      setDomeFog(output, sky, skyVisibility);
      sunColor.setRGB(sky.lightColor[0], sky.lightColor[1], sky.lightColor[2], SRGBColorSpace);
      sunDir.set(...sky.sunDirection);
      moonDir.set(-sky.sunDirection[0], -sky.sunDirection[1], -sky.sunDirection[2]);
      runtime.uniforms.uSunGlow!.value = Math.min(1, sky.lightIntensity);
      runtime.uniforms.uStarWeight!.value = starWeightOf(sky);
      placeDome(mesh, camera);
    },
    setHidden(hidden: boolean): void {
      mesh.visible = !hidden;
    },
    dispose(): void {
      mesh.geometry.dispose();
      runtime.dispose();
      for (const stop of stops) {
        stop.dispose();
      }
    },
  };
};
