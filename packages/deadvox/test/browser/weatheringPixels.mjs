import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/**
 * @import { Page } from 'playwright'
 * @import { Object3D } from 'three'
 */
/** A screen pixel as its column and row. */
/** @typedef {[number, number]} Pixel */

/** @param {string} dataUrl */
const decodeDataUrl = (dataUrl) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

/** @param {Page} page */
const measureInPage = async (page) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The browser-side measurement is self-contained because Playwright serializes this single evaluate callback.
  page.evaluate(async () => {
    /** @param {Object3D} camera */
    const cameraPose = (camera) => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray() });
    /** @param {string} dataUrl */
    const decodeImage = async (dataUrl) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        throw new Error('weathering material measurement needs a 2D canvas context to decode screenshots');
      }
      context.drawImage(image, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        data: context.getImageData(0, 0, canvas.width, canvas.height).data,
      };
    };
    /**
     * @param {Uint8ClampedArray} data
     * @param {number} offset
     */
    const pixelLuminance = (data, offset) =>
      (0.2126 * (data[offset] ?? 0) + 0.7152 * (data[offset + 1] ?? 0) + 0.0722 * (data[offset + 2] ?? 0)) / 255;
    /**
     * @param {Uint8Array | undefined} mask
     * @param {number} width
     * @param {number} height
     * @returns {(x: number, y: number) => boolean}
     */
    const maskReader = (mask, width, height) => {
      if (!mask) {
        throw new Error('weathering material measurement rendered fewer masks than it reads');
      }
      return (x, y) => (mask[((height - 1 - y) * width + x) * 4] ?? 0) > 127;
    };
    /** @param {number[]} values */
    const summarize = (values) => {
      values.sort((a, b) => a - b);
      return {
        mean: values.length > 0 ? values.reduce((total, value) => total + value, 0) / values.length : 0,
        p95: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0,
        max: values.at(-1) ?? 0,
        changedShare: values.length > 0 ? values.filter((value) => value > 0).length / values.length : 0,
      };
    };

    const { engine, view } = globalThis.skellyPlayTest;
    const { renderer: webglRenderer, site: testSite, meshes, camera: activeCamera } = engine;
    if (!webglRenderer) {
      throw new Error('weathering material measurement needs a rendering engine');
    }
    const canvas = webglRenderer.domElement;
    const { weatheringStrengthCeiling, makeMaskMaterial, renderMasks, weatheringMaterialBoxes } = await import(
      '/test/browser/weathering-masks.ts'
    );
    const boxes = weatheringMaterialBoxes(testSite);
    if (canvas.width === 0 || canvas.height === 0) {
      throw new Error('weathering material measurement needs a non-empty renderer canvas');
    }
    const profiles = [...engine.registry.weathering.values()];
    const [weatheringProfile] = [...profiles]
      .filter(({ strength }) => strength > 0)
      .sort((left, right) => right.weatheringBlend - left.weatheringBlend);
    if (!weatheringProfile) {
      throw new Error('weathering material measurement needs a non-default weathering profile');
    }
    const strongProfile = {
      ...weatheringProfile,
      strength: Math.min(weatheringProfile.strength + 1, weatheringStrengthCeiling),
    };
    /** @typedef {[string, Parameters<typeof meshes.setWeathering>[0]]} WeatheringSetting */
    /** @type {WeatheringSetting[]} */
    const settings = [
      ['off', undefined],
      ...profiles.map(/** @returns {WeatheringSetting} */ (profile) => [profile.id, profile]),
      ['zero-control', { ...weatheringProfile, strength: 0 }],
      ['strong', strongProfile],
    ];
    const beforeCamera = cameraPose(activeCamera);
    /** @param {string} boundary */
    const checkCamera = (boundary) => {
      const pose = cameraPose(activeCamera);
      if (JSON.stringify(pose) !== JSON.stringify(beforeCamera)) {
        throw new Error(`weathering camera moved at ${boundary}: ${JSON.stringify({ beforeCamera, pose })}`);
      }
    };
    /** @type {Record<string, string>} */
    const images = {};
    /** @type {Record<string, number>} */
    const uniforms = {};
    for (const [name, profile] of settings) {
      meshes.setWeathering(profile);
      checkCamera(`before render ${name}`);
      view.render();
      checkCamera(`after render ${name}`);
      uniforms[name] = meshes.weatheringStrength;
      // Allow Firefox to present this uniform state before copying the drawing buffer.
      // biome-ignore lint/performance/noAwaitInLoops: each profile needs its own completed framebuffer.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      checkCamera(`profile ${name}`);
      images[name] = canvas.toDataURL('image/png');
    }
    const decoded = new Map(
      await Promise.all(
        Object.entries(images).map(
          async ([name, dataUrl]) => /** @type {const} */ ([name, await decodeImage(dataUrl)]),
        ),
      ),
    );
    /** @param {string} name */
    const decodedPixels = (name) => {
      const image = decoded.get(name);
      if (!image) {
        throw new Error(`weathering material measurement has no ${name} screenshot`);
      }
      return image.data;
    };
    const maskMaterial = makeMaskMaterial(boxes);
    // The chunk batch redraws the chunks on screen, the main pass's, with the mask material in place of its own.
    const { batch } = meshes;
    const chunkMaterial = batch.material;
    batch.material = maskMaterial;
    checkCamera('before masks');
    /** @type {Uint8Array[]} */
    let masks;
    try {
      masks = renderMasks({
        renderer: webglRenderer,
        maskScene: batch,
        camera: activeCamera,
        maskMaterial,
        width: canvas.width,
        height: canvas.height,
        boxes,
      });
    } finally {
      batch.material = chunkMaterial;
    }
    const maskPixelCounts = masks.map((mask) => {
      let count = 0;
      for (let offset = 0; offset < mask.length; offset += 4) {
        if ((mask[offset] ?? 0) > 127) {
          count += 1;
        }
      }
      return count;
    });
    batch.computeBoundingBox();
    if (!batch.boundingBox) {
      throw new Error('weathering material measurement needs the chunk batch bounds');
    }
    const meshBounds = batch.boundingBox.clone().applyMatrix4(batch.matrixWorld);
    const buildingMask = maskReader(masks[0], canvas.width, canvas.height);
    const weatherableMask = maskReader(masks[1], canvas.width, canvas.height);
    /** @type {Pixel[]} */
    const buildingPixels = [];
    /** @type {Pixel[]} */
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
      boxes.map(({ id }, index) => [
        id,
        {
          clean: maskReader(masks[index * 2 + 2], canvas.width, canvas.height),
          weathered: maskReader(masks[index * 2 + 3], canvas.width, canvas.height),
        },
      ]),
    );
    /** @param {(x: number, y: number) => boolean} mask */
    const weatherableIn = (mask) => buildingPixels.filter(([x, y]) => mask(x, y) && weatherableMask(x, y));
    const materialHalves = Object.fromEntries(
      Object.entries(materialMasks).map(([id, { clean, weathered }]) => [
        id,
        { clean: weatherableIn(clean), weathered: weatherableIn(weathered) },
      ]),
    );
    const materialPixels = Object.fromEntries(
      Object.entries(materialHalves).map(([id, sides]) => [id, [...sides.clean, ...sides.weathered]]),
    );
    /**
     * @param {string} imageName
     * @param {readonly Pixel[]} pixels
     */
    const meanColor = (imageName, pixels) => {
      const data = decodedPixels(imageName);
      const total = pixels.reduce(
        /** @param {readonly [number, number, number]} sum */
        (sum, [x, y]) => {
          const offset = (y * canvas.width + x) * 4;
          return /** @type {const} */ ([
            sum[0] + (data[offset] ?? 0),
            sum[1] + (data[offset + 1] ?? 0),
            sum[2] + (data[offset + 2] ?? 0),
          ]);
        },
        /** @type {readonly [number, number, number]} */ ([0, 0, 0]),
      );
      return total.map((channel) => channel / pixels.length / 255);
    };
    /**
     * @param {readonly number[]} left
     * @param {readonly number[]} right
     */
    const colorDistance = (left, right) => Math.hypot(...left.map((channel, index) => channel - (right[index] ?? 0)));
    /**
     * @param {string} imageName
     * @param {readonly Pixel[]} pixels
     */
    const textureContrast = (imageName, pixels) => {
      const selected = new Set(pixels.map(([x, y]) => y * canvas.width + x));
      const data = decodedPixels(imageName);
      let total = 0;
      let pairs = 0;
      for (const [x, y] of pixels) {
        const luminance = pixelLuminance(data, (y * canvas.width + x) * 4);
        for (const [nextX, nextY] of /** @type {const} */ ([
          [x + 1, y],
          [x, y + 1],
        ])) {
          if (selected.has(nextY * canvas.width + nextX)) {
            total += Math.abs(luminance - pixelLuminance(data, (nextY * canvas.width + nextX) * 4));
            pairs += 1;
          }
        }
      }
      return pairs > 0 ? total / pairs : 0;
    };
    const cleanTextureContrasts = Object.fromEntries(
      Object.entries(materialHalves).map(([id, sides]) => [id, textureContrast('off', sides.clean)]),
    );
    /** @param {string} imageName */
    const materialReadability = (imageName) => {
      const means = Object.fromEntries(
        Object.entries(materialHalves).map(([id, sides]) => [
          id,
          {
            clean: meanColor('off', sides.clean),
            weathered: meanColor(imageName, sides.weathered),
            cleanTextureContrast: cleanTextureContrasts[id],
            weatheredTextureContrast: textureContrast(imageName, sides.weathered),
          },
        ]),
      );
      return Object.fromEntries(
        Object.entries(means).map(([id, colors]) => {
          const own = colorDistance(colors.weathered, colors.clean);
          const nearestOther = Math.min(
            ...Object.entries(means)
              .filter(([otherId]) => otherId !== id)
              .map(([, other]) => colorDistance(colors.weathered, other.weathered)),
          );
          return [
            id,
            {
              ownCleanDistance: own,
              nearestOtherWeatheredDistance: nearestOther,
              retainsIdentity: own < nearestOther,
              ...colors,
              retainsTexture: colors.weatheredTextureContrast > 0,
            },
          ];
        }),
      );
    };
    /**
     * @param {string} imageName
     * @param {string} baselineName
     */
    const materialDifferences = (imageName, baselineName) => {
      const image = decodedPixels(imageName);
      const baseline = decodedPixels(baselineName);
      return Object.fromEntries(
        Object.entries(materialPixels).map(([id, pixels]) => [
          id,
          {
            pixels: pixels.length,
            ...summarize(
              pixels.map(([x, y]) => {
                const offset = (y * canvas.width + x) * 4;
                return Math.abs(pixelLuminance(image, offset) - pixelLuminance(baseline, offset));
              }),
            ),
          },
        ]),
      );
    };
    const profilesCompared = Object.fromEntries(
      profiles.map((profile) => [profile.id, materialDifferences(profile.id, 'off')]),
    );
    const off = decodedPixels('off');
    const zeroControl = decodedPixels('zero-control');
    const strong = decodedPixels('strong');
    const maxZeroStrengthPixelChange = Math.max(
      0,
      ...weatherablePixels.map(([x, y]) => {
        const offset = (y * canvas.width + x) * 4;
        return Math.abs(pixelLuminance(zeroControl, offset) - pixelLuminance(off, offset));
      }),
    );
    const maxWeatherablePixelChange = Math.max(
      0,
      ...weatherablePixels.map(([x, y]) => {
        const offset = (y * canvas.width + x) * 4;
        return Math.abs(pixelLuminance(strong, offset) - pixelLuminance(off, offset));
      }),
    );
    checkCamera('after measurements');
    return {
      size: [canvas.width, canvas.height],
      metric: 'absolute Rec. 709 luminance difference on sRGB screenshot pixels, normalized to [0,1]',
      buildingPixels: buildingPixels.length,
      weatherablePixels: weatherablePixels.length,
      weatherableFraction: weatherablePixels.length / buildingPixels.length,
      materialPixels: Object.fromEntries(Object.entries(materialPixels).map(([id, pixels]) => [id, pixels.length])),
      cleanTextureContrasts,
      materialPixelTotal: Object.values(materialPixels).reduce((total, pixels) => total + pixels.length, 0),
      diagnostics: {
        maskPixelCounts,
        camera: cameraPose(activeCamera),
        meshBounds: { min: meshBounds.min.toArray(), max: meshBounds.max.toArray() },
        weatheringMaterialBoxes: boxes,
      },
      differences: profilesCompared,
      materialReadability: Object.fromEntries(profiles.map((profile) => [profile.id, materialReadability(profile.id)])),
      maxWeatherablePixelChange,
      maxZeroStrengthPixelChange,
      images,
      uniforms,
      authoredStrength: weatheringProfile.strength,
      strongStrength: strongProfile.strength,
      strengthCeiling: weatheringStrengthCeiling,
      profileStrengths: Object.fromEntries(profiles.map((profile) => [profile.id, profile.strength])),
      beforeCamera,
      afterCamera: cameraPose(activeCamera),
    };
  });

/** @typedef {Awaited<ReturnType<typeof measureInPage>>} WeatheringMeasurement */

/** @param {Page} page */
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
  const unrenderedMaterials = Object.entries(result.cleanTextureContrasts)
    .filter(([, contrast]) => contrast === 0)
    .map(([id]) => id);
  if (unrenderedMaterials.length > 0) {
    throw new Error(
      `comparison pad is in the geometric mask but its clean surfaces are not rendered: ${unrenderedMaterials.join(', ')}`,
    );
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
