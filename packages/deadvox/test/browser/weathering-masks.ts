import { WEATHERING_STRENGTH_MAX } from '@skelly/engine/internal/core/weather.ts';
import { DebugWeatheringTestSite } from '@skelly/engine/internal/game/weatheringTestSite.ts';
import {
  type Camera,
  Color,
  DoubleSide,
  type Object3D,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

type MaterialBox = DebugWeatheringTestSite['weatheringMaterialBoxes'][number];

export const weatheringStrengthCeiling = WEATHERING_STRENGTH_MAX;

export const weatheringMaterialBoxes = (site: unknown) => {
  if (!(site instanceof DebugWeatheringTestSite)) {
    throw new Error('weathering material measurement needs the weathering test site');
  }
  const boxes = site.weatheringMaterialBoxes;
  if (boxes.length === 0) {
    throw new Error('weathering material measurement needs the comparison-pad material bands');
  }
  return boxes;
};

export const makeMaskMaterial = (boxes: readonly MaterialBox[]) => {
  const count = boxes.length;
  return new ShaderMaterial({
    uniforms: {
      uBuildingMin: { value: boxes.map(({ min }) => new Vector3(...min)) },
      uBuildingMax: { value: boxes.map(({ max }) => new Vector3(...max)) },
      uMode: { value: 0 },
      uSelectedBuilding: { value: 0 },
      uSide: { value: 0 },
      uWeatheringSplit: { value: 0 },
    },
    vertexShader: `
#include <batching_pars_vertex>
attribute float weatherable;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vWeatherable;
void main() {
#include <batching_vertex>
  vec4 placed = batchingMatrix * vec4(position, 1.0);
  vWorld = (modelMatrix * placed).xyz;
  vNormal = normalize(normal);
  vWeatherable = weatherable;
  gl_Position = projectionMatrix * modelViewMatrix * placed;
}`,
    fragmentShader: `
precision highp float;
uniform vec3 uBuildingMin[${count}];
uniform vec3 uBuildingMax[${count}];
uniform int uMode;
uniform int uSelectedBuilding;
uniform int uSide;
uniform float uWeatheringSplit;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vWeatherable;
void main() {
  bool building = false;
  bool selectedBuilding = false;
  for (int i = 0; i < ${count}; i++) {
    bool inside = vWorld.x >= uBuildingMin[i].x && vWorld.x <= uBuildingMax[i].x &&
      vWorld.y >= uBuildingMin[i].y && vWorld.y < uBuildingMax[i].y &&
      vWorld.z >= uBuildingMin[i].z && vWorld.z <= uBuildingMax[i].z;
    bool wall = abs(vNormal.y) < 0.5;
    building = building || (inside && wall);
    bool side = uSide == 0 || (uSide == 1 ? vWorld.x >= uWeatheringSplit : vWorld.x < uWeatheringSplit);
    selectedBuilding = selectedBuilding || (i == uSelectedBuilding && inside && wall && side);
  }
  bool weatherable = vWeatherable > 0.5;
  bool selected = uMode == 0 ? building : (uMode == 1 ? building && weatherable : selectedBuilding && weatherable);
  gl_FragColor = selected ? vec4(1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}`,
    depthTest: true,
    depthWrite: true,
    side: DoubleSide,
    toneMapped: false,
  });
};

export const renderMasks = ({
  renderer,
  maskScene,
  camera,
  maskMaterial,
  width,
  height,
  boxes,
}: {
  renderer: WebGLRenderer;
  maskScene: Object3D;
  camera: Camera;
  maskMaterial: ShaderMaterial;
  width: number;
  height: number;
  boxes: readonly MaterialBox[];
}) => {
  const target = new WebGLRenderTarget(width, height, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  const pixels = new Uint8Array(width * height * 4);
  const masks: Uint8Array[] = [];
  const clearColor = renderer.getClearColor(new Color()).clone();
  const clearAlpha = renderer.getClearAlpha();
  const previousTarget = renderer.getRenderTarget();
  const { uMode, uSelectedBuilding, uSide } = maskMaterial.uniforms;
  if (!(uMode && uSelectedBuilding && uSide)) {
    throw new Error('weathering material measurement needs the mask selection uniforms');
  }
  const renderOne = (mode: number, selectedBuilding = 0, side = 0) => {
    uMode.value = mode;
    uSelectedBuilding.value = selectedBuilding;
    uSide.value = side;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x00_00_00, 1);
    renderer.clear(true, true, true);
    renderer.render(maskScene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    masks.push(new Uint8Array(pixels));
  };
  try {
    renderOne(0);
    renderOne(1);
    boxes.forEach((_, index) => {
      renderOne(2, index, 2);
      renderOne(2, index, 1);
    });
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(clearColor, clearAlpha);
    target.dispose();
    maskMaterial.dispose();
  }
  return masks;
};
