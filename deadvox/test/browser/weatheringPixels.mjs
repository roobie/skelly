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
    bool inside = vWorld.x >= uBuildingMin[i].x && vWorld.x <= uBuildingMax[i].x &&
      vWorld.y >= uBuildingMin[i].y && vWorld.y < uBuildingMax[i].y &&
      vWorld.z >= uBuildingMin[i].z && vWorld.z <= uBuildingMax[i].z;
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

    const makeMixMaterial = ({ THREE: threeLib, profile, weatherablePatternGlsl, surfacePatternsGlsl }) =>
      new threeLib.ShaderMaterial({
        uniforms: {
          uStrength: { value: profile.strength },
          uVariationScale: { value: profile.variationScaleMetres },
          uVariation: { value: profile.variationStrength },
          uMossThreshold: { value: profile.mossThreshold },
          uMossBias: { value: profile.mossBias },
          uTintDarkness: { value: profile.tintDarkness },
          uStreakStrength: { value: profile.streakStrength },
          uStreakLength: { value: profile.streakLengthMetres },
          uMossStrength: { value: profile.mossStrength },
          uMixCeiling: { value: profile.mixCeiling },
        },
        vertexShader: `
attribute float pattern;
attribute float occlusion;
attribute vec2 weather;
varying vec3 vWorld;
varying vec3 vFaceN;
varying float vPattern;
varying float vOcclusion;
varying vec2 vWeather;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vFaceN = normalize(normal);
  vPattern = pattern;
  vOcclusion = occlusion;
  vWeather = weather;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
        fragmentShader: `
precision highp float;
uniform float uStrength;
uniform float uVariationScale;
uniform float uVariation;
uniform float uMossThreshold;
uniform float uMossBias;
uniform float uTintDarkness;
uniform float uStreakStrength;
uniform float uStreakLength;
uniform float uMossStrength;
uniform float uMixCeiling;
varying vec3 vWorld;
varying vec3 vFaceN;
varying float vPattern;
varying float vOcclusion;
varying vec2 vWeather;
${surfacePatternsGlsl}
void main() {
  vec2 patUV = surfaceUV(vWorld, vFaceN);
  float patSeed = dot(abs(vFaceN), vec3(7.13, 13.7, 3.31));
  float verticalFace = 1.0 - abs(vFaceN.y);
  float weatherable = (${weatherablePatternGlsl('vPattern')}) ? 1.0 : 0.0;
  float grain = vnoise(patUV * 1.7 + vec2(patSeed));
  float weatherPatch = smoothstep(0.28, 0.76, grain);
  float sheltered = clamp(vOcclusion, 0.0, 1.0);
  float broadNoise = vnoise(patUV / uVariationScale);
  float broadStrength = mix(1.0, 0.24 + 1.52 * broadNoise, uVariation);
  float cornerGrime = (1.0 - sheltered) * (0.22 + 0.34 * weatherPatch) + vWeather.y * 0.3;
  float grime = cornerGrime * broadStrength;
  float streakNoise = vnoise(vec2(patUV.x * 3.1 + patSeed, patUV.y * 0.381 / uStreakLength));
  float streak = verticalFace * vWeather.x * smoothstep(0.48, 0.78, streakNoise) *
    (1.0 - smoothstep(0.0, 0.75, fract(patUV.y / uStreakLength))) * broadStrength;
  float northShade = 0.65 + 0.35 * step(vFaceN.z, -0.5);
  float baseMoss = (1.0 - sheltered) * (0.4 + 0.6 * weatherPatch) * (0.25 + 0.75 * verticalFace) * northShade;
  vec2 warp = (vec2(
    vnoise(patUV / uVariationScale + vec2(17.2, 31.7)),
    vnoise(patUV / uVariationScale + vec2(47.1, 11.8))
  ) - 0.5) * 1.4;
  float mossNoise = vnoise(patUV / (uVariationScale * 0.28) + warp);
  float environment = clamp(vWeather.y * 0.65 + (1.0 - vWeather.x) * 0.35, 0.0, 1.0);
  float mossCutoff = uMossThreshold - uMossBias * environment;
  float mossPatches = smoothstep(mossCutoff, mossCutoff + 0.18, mossNoise) * environment * uVariation;
  float moss = baseMoss * broadStrength + mossPatches;
  float mixAmount = clamp(weatherable * uStrength * clamp(
    uTintDarkness * grime + uStreakStrength * streak + uMossStrength * moss, 0.0, uMixCeiling
  ), 0.0, 1.0);
  gl_FragColor = vec4(vec3(mixAmount), 1.0);
}`,
        side: threeLib.DoubleSide,
        depthTest: true,
        depthWrite: true,
        toneMapped: false,
      });

    const renderMixAmounts = ({ THREE: threeLib, renderer: maskRenderer, group, camera, width, height, profile }) => {
      const material = makeMixMaterial({
        THREE: threeLib,
        profile,
        weatherablePatternGlsl: globalThis.firefoxUiTest.weatherablePatternGlsl,
        surfacePatternsGlsl: globalThis.firefoxUiTest.surfacePatternsGlsl,
      });
      const scene = new threeLib.Scene();
      const measurementGroup = group.clone(true);
      measurementGroup.traverse((object) => {
        if (object.isMesh) {
          object.material = material;
        }
      });
      scene.add(measurementGroup);
      const target = new threeLib.WebGLRenderTarget(width, height, {
        format: threeLib.RGBAFormat,
        type: threeLib.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false,
      });
      const pixels = new Uint8Array(width * height * 4);
      const previousTarget = maskRenderer.getRenderTarget();
      const clearColor = maskRenderer.getClearColor(new threeLib.Color()).clone();
      const clearAlpha = maskRenderer.getClearAlpha();
      try {
        maskRenderer.setRenderTarget(target);
        maskRenderer.setClearColor(0x00_00_00, 1);
        maskRenderer.clear(true, true, true);
        maskRenderer.render(scene, camera);
        maskRenderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      } finally {
        maskRenderer.setRenderTarget(previousTarget);
        maskRenderer.setClearColor(clearColor, clearAlpha);
        target.dispose();
        material.dispose();
      }
      return pixels;
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
    const mixPixels = renderMixAmounts({
      THREE: Three,
      renderer: webglRenderer,
      group: engine.meshes.group,
      camera: activeCamera,
      width: canvas.width,
      height: canvas.height,
      profile: overgrown,
    });
    const nearFullReplacementShares = Object.fromEntries(
      Object.entries(materialPixels).map(([id, pixels]) => [
        id,
        pixels.filter(([x, y]) => (mixPixels[(y * canvas.width + x) * 4] / 255) * overgrown.weatheringBlend >= 0.85)
          .length / pixels.length,
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
      nearFullReplacementShares,
      materialPixelTotal: Object.values(materialPixels).reduce((total, pixels) => total + pixels.length, 0),
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
  if (result.materialPixelTotal !== result.buildingPixels) {
    throw new Error(
      `comparison pad material masks must partition the building pixels: ${JSON.stringify({
        buildingPixels: result.buildingPixels,
        materialPixelTotal: result.materialPixelTotal,
        materialPixels: result.materialPixels,
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
  const { images, ...metrics } = result;
  await Promise.all([
    ...Object.entries(images).map(([name, dataUrl]) =>
      writeFile(path.join(artifactsDir, `comparison-${name}.png`), decodeDataUrl(dataUrl)),
    ),
    writeFile(path.join(artifactsDir, 'measurement.json'), `${JSON.stringify(metrics, null, 2)}\n`),
  ]);
  return result;
};
