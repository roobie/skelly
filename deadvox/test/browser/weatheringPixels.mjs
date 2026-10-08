import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const decodeDataUrl = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

const measureInPage = async (page) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The browser-side measurement is self-contained because Playwright serializes this single evaluate callback.
  page.evaluate(async () => {
    const makeMaskMaterial = ({ THREE: threeLib, boxes: materialBoxes, weatherablePatternGlsl }) => {
      const count = materialBoxes.length;
      const weatherablePattern = weatherablePatternGlsl('vPattern');
      return new threeLib.ShaderMaterial({
        uniforms: {
          uBuildingMin: { value: materialBoxes.map(({ min }) => new threeLib.Vector3(...min)) },
          uBuildingMax: { value: materialBoxes.map(({ max }) => new threeLib.Vector3(...max)) },
          uMode: { value: 0 },
          uSelectedBuilding: { value: 0 },
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
uniform int uMode;
uniform int uSelectedBuilding;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vPattern;
void main() {
  bool building = false;
  bool selectedBuilding = false;
  for (int i = 0; i < ${count}; i++) {
    bool inside = all(greaterThanEqual(vWorld, uBuildingMin[i])) && all(lessThanEqual(vWorld, uBuildingMax[i]));
    bool wall = abs(vNormal.y) < 0.5;
    building = building || (inside && wall);
    selectedBuilding = selectedBuilding || (i == uSelectedBuilding && inside && wall);
  }
  bool weatherable = ${weatherablePattern};
  bool selected = uMode == 0 ? building : (uMode == 1 ? building && weatherable : selectedBuilding && weatherable);
  gl_FragColor = selected ? vec4(1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}`,
        depthTest: true,
        depthWrite: true,
        side: threeLib.DoubleSide,
        toneMapped: false,
      });
    };

    const renderMasks = ({
      THREE: threeLib,
      renderer: maskRenderer,
      maskScene: maskWorld,
      camera: renderCamera,
      maskMaterial: material,
      width,
      height,
      boxes: materialBoxes,
    }) => {
      const target = new threeLib.WebGLRenderTarget(width, height, {
        format: threeLib.RGBAFormat,
        type: threeLib.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
      });
      target.texture.generateMipmaps = false;
      const pixels = new Uint8Array(width * height * 4);
      const masks = [];
      const clearColor = maskRenderer.getClearColor(new threeLib.Color()).clone();
      const clearAlpha = maskRenderer.getClearAlpha();
      const previousTarget = maskRenderer.getRenderTarget();
      const renderOne = (mode, selectedBuilding = 0) => {
        material.uniforms.uMode.value = mode;
        material.uniforms.uSelectedBuilding.value = selectedBuilding;
        maskRenderer.setRenderTarget(target);
        maskRenderer.setClearColor(0x00_00_00, 1);
        maskRenderer.clear(true, true, true);
        maskRenderer.render(maskWorld, renderCamera);
        maskRenderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
        masks.push(new Uint8Array(pixels));
      };
      try {
        renderOne(0);
        renderOne(1);
        materialBoxes.forEach((_, index) => {
          renderOne(2, index);
        });
      } finally {
        maskRenderer.setRenderTarget(previousTarget);
        maskRenderer.setClearColor(clearColor, clearAlpha);
        target.dispose();
        material.dispose();
      }
      return masks;
    };

    const cameraPose = (camera) => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray() });
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
    const pixelLuminance = (data, offset) =>
      (0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]) / 255;
    const maskReader = (mask, width, height) => (x, y) => mask[((height - 1 - y) * width + x) * 4] > 127;
    const summarize = (values) => {
      values.sort((a, b) => a - b);
      return {
        mean: values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0,
        p95: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0,
        max: values.at(-1) ?? 0,
        changedShare: values.length > 0 ? values.filter((value) => value > 0).length / values.length : 0,
      };
    };

    const { engine, THREE: Three, camera: activeCamera, view } = globalThis.firefoxUiTest;
    const { renderer: webglRenderer, site: testSite, meshes } = engine;
    const canvas = webglRenderer.domElement;
    const boxes = testSite.weatheringMaterialBoxes;
    if (!Array.isArray(boxes) || boxes.length === 0) {
      throw new Error('weathering material measurement needs the comparison-pad material bands');
    }
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('weathering material measurement needs a non-empty renderer canvas');
    }
    const profiles = [...engine.registry.weathering.values()];
    const { weathering: weatheringMeshes } = meshes;
    const overgrown = engine.registry.weathering.get('overgrown');
    if (!overgrown) {
      throw new Error('weathering material measurement needs the overgrown profile');
    }
    const strongProfile = {
      ...overgrown,
      strength: Math.min(overgrown.strength + 1, globalThis.firefoxUiTest.weatheringStrengthMax),
    };
    const settings = [
      ['off', undefined],
      ...profiles.map((profile) => [profile.id, profile]),
      ['zero-control', { ...overgrown, strength: 0 }],
      ['strong', strongProfile],
    ];
    const images = {};
    const uniforms = {};
    for (const [name, profile] of settings) {
      meshes.setWeathering(profile);
      view.render();
      uniforms[name] = weatheringMeshes.value;
      // Allow Firefox to present this uniform state before copying the drawing buffer.
      // biome-ignore lint/performance/noAwaitInLoops: each profile needs its own completed framebuffer.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      images[name] = canvas.toDataURL('image/png');
    }
    const decoded = Object.fromEntries(
      await Promise.all(Object.entries(images).map(async ([name, dataUrl]) => [name, await decodeImage(dataUrl)])),
    );
    const maskMaterial = makeMaskMaterial({
      THREE: Three,
      boxes,
      weatherablePatternGlsl: globalThis.firefoxUiTest.weatherablePatternGlsl,
    });
    const maskGroup = engine.meshes.group.clone(true);
    maskGroup.traverse((object) => {
      if (object.isMesh) {
        object.material = maskMaterial;
      }
    });
    const maskScene = new Three.Scene();
    maskScene.add(maskGroup);
    const masks = renderMasks({
      THREE: Three,
      renderer: webglRenderer,
      maskScene,
      camera: activeCamera,
      maskMaterial,
      width: canvas.width,
      height: canvas.height,
      boxes,
    });
    const maskPixelCounts = masks.map((mask) => {
      let count = 0;
      for (let offset = 0; offset < mask.length; offset += 4) {
        if (mask[offset] > 127) {
          count += 1;
        }
      }
      return count;
    });
    const meshBounds = new Three.Box3().setFromObject(maskGroup);
    const buildingMask = maskReader(masks[0], canvas.width, canvas.height);
    const weatherableMask = maskReader(masks[1], canvas.width, canvas.height);
    const buildingPixels = [];
    const weatherablePixels = [];
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (!buildingMask(x, y)) {
          continue;
        }
        buildingPixels.push([x, y]);
        if (weatherableMask(x, y)) {
          weatherablePixels.push([x, y]);
        }
      }
    }
    const materialMasks = Object.fromEntries(
      boxes.map(({ id }, index) => [id, maskReader(masks[index + 2], canvas.width, canvas.height)]),
    );
    const materialPixels = Object.fromEntries(
      Object.entries(materialMasks).map(([id, mask]) => [
        id,
        buildingPixels.filter(([x, y]) => mask(x, y) && weatherableMask(x, y)),
      ]),
    );
    const materialDifferences = (imageName, baselineName) =>
      Object.fromEntries(
        Object.entries(materialPixels).map(([id, pixels]) => [
          id,
          {
            pixels: pixels.length,
            ...summarize(
              pixels.map(([x, y]) => {
                const offset = (y * canvas.width + x) * 4;
                return Math.abs(
                  pixelLuminance(decoded[imageName].data, offset) - pixelLuminance(decoded[baselineName].data, offset),
                );
              }),
            ),
          },
        ]),
      );
    const profilesCompared = Object.fromEntries(
      profiles.map((profile) => [profile.id, materialDifferences(profile.id, 'off')]),
    );
    const maxZeroStrengthPixelChange = Math.max(
      0,
      ...weatherablePixels.map(([x, y]) => {
        const offset = (y * canvas.width + x) * 4;
        return Math.abs(
          pixelLuminance(decoded['zero-control'].data, offset) - pixelLuminance(decoded.off.data, offset),
        );
      }),
    );
    const maxWeatherablePixelChange = Math.max(
      0,
      ...weatherablePixels.map(([x, y]) => {
        const offset = (y * canvas.width + x) * 4;
        return Math.abs(pixelLuminance(decoded.strong.data, offset) - pixelLuminance(decoded.off.data, offset));
      }),
    );
    const beforeCamera = cameraPose(activeCamera);
    return {
      size: [canvas.width, canvas.height],
      metric: 'absolute Rec. 709 luminance difference on sRGB screenshot pixels, normalized to [0,1]',
      buildingPixels: buildingPixels.length,
      weatherablePixels: weatherablePixels.length,
      weatherableFraction: weatherablePixels.length / buildingPixels.length,
      materialPixels: Object.fromEntries(Object.entries(materialPixels).map(([id, pixels]) => [id, pixels.length])),
      diagnostics: {
        maskPixelCounts,
        camera: cameraPose(activeCamera),
        meshBounds: { min: meshBounds.min.toArray(), max: meshBounds.max.toArray() },
        weatheringMaterialBoxes: boxes,
      },
      differences: profilesCompared,
      maxWeatherablePixelChange,
      maxZeroStrengthPixelChange,
      images,
      uniforms,
      authoredStrength: overgrown.strength,
      strongStrength: strongProfile.strength,
      strengthCeiling: globalThis.firefoxUiTest.weatheringStrengthMax,
      profileStrengths: Object.fromEntries(profiles.map((profile) => [profile.id, profile.strength])),
      beforeCamera,
      afterCamera: cameraPose(activeCamera),
    };
  });

export const measureWeatheringMaterials = async (page) => {
  const result = await measureInPage(page);
  if (!(result.buildingPixels > 0 && result.weatherablePixels > 0)) {
    throw new Error(
      `comparison pad has no measured building/weatherable wall pixels: ${JSON.stringify({
        size: result.size,
        buildingPixels: result.buildingPixels,
        weatherablePixels: result.weatherablePixels,
        materialPixels: result.materialPixels,
        diagnostics: result.diagnostics,
      })}`,
    );
  }
  for (const [id, pixels] of Object.entries(result.materialPixels)) {
    if (pixels === 0) {
      throw new Error(`comparison pad material ${id} has no weatherable pixels`);
    }
  }
  const artifactsDir = path.resolve(process.cwd(), 'test-results', 'weathering');
  await mkdir(artifactsDir, { recursive: true });
  await Promise.all(
    Object.entries(result.images).map(([name, dataUrl]) =>
      writeFile(path.join(artifactsDir, `comparison-${name}.png`), decodeDataUrl(dataUrl)),
    ),
  );
  return result;
};
