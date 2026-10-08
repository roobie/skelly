import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const decodeDataUrl = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

const measureInPage = async (page) =>
  page.evaluate(async () => {
    const { engine, THREE, corrugatedPattern, minimumShaderSignal } = globalThis.firefoxUiTest;
    const { site, config, renderer, meshes, camera } = engine;
    const canvas = renderer.domElement;
    if (!(site && Array.isArray(site.lots)) || site.lots.length === 0) {
      throw new Error('weathering pixel mask needs the generated hamlet lots');
    }
    const { blockSize } = config.scale;
    const buildingBoxes = site.lots.map(({ placement }) => {
      const [sx, sy, sz] = placement.template.size;
      const [width, depth] = placement.turn % 2 === 0 ? [sx, sz] : [sz, sx];
      return {
        min: [placement.origin[0] * blockSize, placement.origin[1] * blockSize, placement.origin[2] * blockSize],
        max: [
          (placement.origin[0] + width) * blockSize,
          (placement.origin[1] + sy) * blockSize,
          (placement.origin[2] + depth) * blockSize,
        ],
      };
    });
    const { width, height } = canvas;
    if (width === 0 || height === 0) {
      throw new Error('weathering pixel mask needs a non-empty renderer canvas');
    }
    const minBuildingY = buildingBoxes.map(({ min }) => min[1]);
    const maskMaterial = makeMaskMaterial({
      THREE,
      boxes: buildingBoxes,
      minBuildingY,
      corrugatedPattern,
      groundBand: blockSize * 4,
    });
    const maskGroup = meshes.group.clone(true);
    maskGroup.traverse((object) => {
      if (object.isMesh) {
        object.material = maskMaterial;
      }
    });
    const maskScene = new THREE.Scene();
    maskScene.add(maskGroup);
    const masks = renderMasks({ THREE, renderer, maskScene, camera, maskMaterial, width, height, buildingBoxes });
    const content = engine.registry.weathering.get('world');
    if (!content) {
      throw new Error('weathering pixel measurement needs the authored world settings');
    }
    const beforeCamera = cameraPose(camera);
    const images = await captureImages({ meshes, canvas, content });
    const decoded = Object.fromEntries(
      await Promise.all(Object.entries(images).map(async ([name, dataUrl]) => [name, await decodeImage(dataUrl)])),
    );
    const measurements = analyzePixels({ masks, decoded, width, height });
    const closeup = makeGroundWallCloseup({
      bounds: measurements.groundWallBounds,
      decoded: decoded.strong,
      width,
      height,
    });
    const srgb = (linear) => (linear <= 0.003_130_8 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055);
    return {
      size: [width, height],
      metric: 'absolute Rec. 709 luminance difference on sRGB screenshot pixels, normalized to [0,1]',
      derivedRelativeThreshold: 1 - srgb(1 - minimumShaderSignal),
      ...measurements,
      images,
      closeup,
      beforeCamera,
      afterCamera: cameraPose(camera),
    };
  });

const makeMaskMaterial = ({ THREE, boxes, minBuildingY, corrugatedPattern, groundBand }) => {
  const count = boxes.length;
  return new THREE.ShaderMaterial({
    uniforms: {
      uBuildingMin: { value: boxes.map(({ min }) => new THREE.Vector3(...min)) },
      uBuildingMax: { value: boxes.map(({ max }) => new THREE.Vector3(...max)) },
      uBuildingMinY: { value: minBuildingY },
      uMode: { value: 0 },
      uSelectedBuilding: { value: 0 },
      uCorrugatedPattern: { value: corrugatedPattern },
      uGroundBand: { value: groundBand },
    },
    vertexShader: `
attribute float pattern;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vPattern;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(normal);
  vPattern = pattern;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: `
precision highp float;
uniform vec3 uBuildingMin[${count}];
uniform vec3 uBuildingMax[${count}];
uniform float uBuildingMinY[${count}];
uniform int uMode;
uniform int uSelectedBuilding;
uniform float uCorrugatedPattern;
uniform float uGroundBand;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vPattern;
void main() {
  bool building = false;
  bool groundWall = false;
  for (int i = 0; i < ${count}; i++) {
    bool inside = all(greaterThanEqual(vWorld, uBuildingMin[i])) && all(lessThanEqual(vWorld, uBuildingMax[i]));
    bool verticalWall = abs(vNormal.y) < 0.5;
    building = building || (inside && verticalWall);
    groundWall = groundWall || (i == uSelectedBuilding && inside && verticalWall && vWorld.y <= uBuildingMinY[i] + uGroundBand);
  }
  bool weatherable = vPattern > 0.5 && abs(vPattern - uCorrugatedPattern) > 0.5;
  bool selected = uMode == 0 ? building : (uMode == 1 ? building && weatherable : groundWall && weatherable);
  gl_FragColor = selected ? vec4(1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}`,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
};

const renderMasks = ({ THREE, renderer, maskScene, camera, maskMaterial, width, height, buildingBoxes }) => {
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  const pixels = new Uint8Array(width * height * 4);
  const masks = [];
  const clearColor = renderer.getClearColor(new THREE.Color()).clone();
  const clearAlpha = renderer.getClearAlpha();
  const previousTarget = renderer.getRenderTarget();
  const cameraPosition = camera.position;
  let selectedBuilding = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  buildingBoxes.forEach(({ min, max }, index) => {
    const centerX = (min[0] + max[0]) / 2;
    const centerY = (min[1] + max[1]) / 2;
    const centerZ = (min[2] + max[2]) / 2;
    const distance =
      (centerX - cameraPosition.x) ** 2 + (centerY - cameraPosition.y) ** 2 + (centerZ - cameraPosition.z) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      selectedBuilding = index;
    }
  });
  const renderOne = (mode) => {
    maskMaterial.uniforms.uMode.value = mode;
    maskMaterial.uniforms.uSelectedBuilding.value = selectedBuilding;
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
    renderOne(2);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(clearColor, clearAlpha);
    target.dispose();
    maskMaterial.dispose();
  }
  return masks;
};

const captureImages = async ({ meshes, canvas, content }) => {
  const settings = [
    ['off', 0],
    ['default', content.strength],
    ['strong', 1],
    ['zero-control', 0],
  ];
  const images = {};
  for (const [name, strength] of settings) {
    meshes.setWeathering({ ...content, strength });
    // biome-ignore lint/performance/noAwaitInLoops: each uniform setting needs a rendered frame before its PNG is captured.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    images[name] = canvas.toDataURL('image/png');
  }
  return images;
};

const decodeImage = async (dataUrl) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return {
    width: canvas.width,
    height: canvas.height,
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
  };
};

const maskReader = (mask, width, height) => (x, y) => mask[((height - 1 - y) * width + x) * 4] > 127;
const pixelLuminance = (data, offset) =>
  (0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]) / 255;
const cameraPose = (camera) => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray() });
const analyzePixels = ({ masks, decoded, width, height }) => {
  const deltas = { default: [], strong: [] };
  let buildingPixels = 0;
  let weatherablePixels = 0;
  const isBuilding = maskReader(masks[0], width, height);
  const isWeatherable = maskReader(masks[1], width, height);
  let maxRelativeWeatherableChange = 0;
  let maxRelativeZeroStrengthChange = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isBuilding(x, y)) {
        continue;
      }
      buildingPixels += 1;
      const offset = (y * width + x) * 4;
      const off = pixelLuminance(decoded.off.data, offset);
      for (const name of ['default', 'strong']) {
        deltas[name].push(Math.abs(pixelLuminance(decoded[name].data, offset) - off));
      }
      if (isWeatherable(x, y)) {
        weatherablePixels += 1;
        const strong = pixelLuminance(decoded.strong.data, offset);
        const zeroControl = pixelLuminance(decoded['zero-control'].data, offset);
        const denominator = Math.max(off, 1 / 255);
        maxRelativeWeatherableChange = Math.max(maxRelativeWeatherableChange, Math.abs(strong - off) / denominator);
        maxRelativeZeroStrengthChange = Math.max(
          maxRelativeZeroStrengthChange,
          Math.abs(zeroControl - off) / denominator,
        );
      }
    }
  }
  const summarize = (values) => {
    values.sort((a, b) => a - b);
    return {
      mean: values.reduce((total, value) => total + value, 0) / values.length,
      p95: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0,
    };
  };
  return {
    buildingPixels,
    weatherablePixels,
    weatherableFraction: weatherablePixels / buildingPixels,
    ...analyzeGroundWallBounds(masks[2], width, height),
    differences: { default: summarize(deltas.default), strong: summarize(deltas.strong) },
    maxRelativeWeatherableChange,
    maxRelativeZeroStrengthChange,
  };
};

const makeGroundWallCloseup = ({ bounds, decoded, width, height }) => {
  if (!bounds) {
    return;
  }
  const [minX, minY, maxX, maxY] = bounds;
  const margin = Math.max(8, Math.round(Math.min(maxX - minX + 1, maxY - minY + 1) * 0.12));
  const sx = Math.max(0, minX - margin);
  const sy = Math.max(0, minY - margin);
  const sw = Math.min(width - sx, maxX - minX + 1 + margin * 2);
  const sh = Math.min(height - sy, maxY - minY + 1 + margin * 2);
  const zoom = 3;
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  source.getContext('2d').putImageData(new ImageData(decoded.data, width, height), 0, 0);
  const crop = document.createElement('canvas');
  crop.width = sw * zoom;
  crop.height = sh * zoom;
  crop.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
  return crop.toDataURL('image/png');
};

const analyzeGroundWallBounds = (mask, width, height) => {
  const isGroundWall = maskReader(mask, width, height);
  let groundWallPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isGroundWall(x, y)) {
        continue;
      }
      groundWallPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { groundWallPixels, groundWallBounds: maxX < 0 ? undefined : [minX, minY, maxX, maxY] };
};

export const measureHamletWeathering = async (page) => {
  const result = await measureInPage(page);
  if (!(result.buildingPixels > 0 && result.weatherablePixels > 0 && result.groundWallPixels > 0)) {
    throw new Error(
      `hamlet camera has no measured building/weatherable wall pixels: ${JSON.stringify({
        size: result.size,
        buildingPixels: result.buildingPixels,
        weatherablePixels: result.weatherablePixels,
        groundWallPixels: result.groundWallPixels,
      })}`,
    );
  }
  const artifactsDir = path.resolve(process.cwd(), 'test-results', 'weathering');
  await mkdir(artifactsDir, { recursive: true });
  await Promise.all(
    ['off', 'default', 'strong'].map((name) =>
      writeFile(path.join(artifactsDir, `hamlet-${name}.png`), decodeDataUrl(result.images[name])),
    ),
  );
  if (result.closeup) {
    await writeFile(
      path.join(artifactsDir, 'hamlet-weatherable-wall-ground-strong.png'),
      decodeDataUrl(result.closeup),
    );
  }
  return result;
};
