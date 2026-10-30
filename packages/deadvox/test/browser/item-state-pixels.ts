import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildRegistry } from '../../src/core/content.ts';
import { ItemFactory, snapshotItem } from '../../src/core/items.ts';
import { ItemPictures } from '../../src/render/itemPictures.ts';
import { ModelLibrary } from '../../src/render/models.ts';
import { ItemViewer } from '../../src/ui/itemViewer.ts';

const coloredPixels = (canvas: HTMLCanvasElement) => {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let red = 0;
  let blue = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3]! === 0) {
      continue;
    }
    if (pixels[i]! > pixels[i + 1]! && pixels[i]! > pixels[i + 2]!) {
      red += 1;
    }
    if (pixels[i + 2]! > pixels[i]! && pixels[i + 2]! > pixels[i + 1]!) {
      blue += 1;
    }
  }
  return { red, blue };
};

/** Fixture geometry keeps pixel proof independent of authored items and tuning. */
export const statePixelFixture = async () => {
  const scene = new Group();
  const material = (name: string, color: string, opacity = 1) => {
    const result = new MeshStandardMaterial({ color, opacity, transparent: opacity < 1, depthWrite: opacity === 1 });
    result.name = name;
    return result;
  };
  scene.add(new Mesh(new BoxGeometry(1, 1.5, 0.5), material('glass', '#ffffff', 0.12)));
  const collar = new Mesh(new BoxGeometry(1, 0.3, 0.5), material('metal', '#999999'));
  collar.position.y = 0.9;
  scene.add(collar);
  const fillGeometry = new BoxGeometry(0.8, 1.2, 0.3);
  fillGeometry.translate(0, 0.6, 0);
  const fill = new Mesh(fillGeometry, material('fuel', '#0033ff'));
  fill.position.y = -0.6;
  fill.name = 'fuel:fill';
  scene.add(fill);
  const bytes = (await new GLTFExporter().parseAsync(scene, { binary: true })) as ArrayBuffer;
  const jsonLength = new DataView(bytes).getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength))) as {
    materials: { name: string }[];
  };
  const { registry, issues } = buildRegistry([
    {
      source: 'pixel-state',
      data: {
        itemWear: [
          {
            id: 'wear',
            bands: [
              {
                from: 0,
                tints: {
                  glass: { color: '#ffffff', mix: 0 },
                  fuel: { color: '#0033ff', mix: 0 },
                  metal: { color: '#ff0000', mix: 1 },
                },
              },
              {
                from: 0.5,
                tints: {
                  glass: { color: '#ffffff', mix: 0 },
                  fuel: { color: '#0033ff', mix: 0 },
                  metal: { color: '#ff0000', mix: 0 },
                },
              },
            ],
          },
        ],
        models: [
          {
            id: 'pixel',
            file: 'assets/models/pixel.glb',
            itemPresentation: {
              materials: gltf.materials.map(({ name }) => name),
              wear: 'wear',
              supply: {
                kind: 'fill',
                piece: 'fuel:fill',
                axis: 'y',
                bands: [
                  { from: 0, scale: 0.2 },
                  { from: 0.5, scale: 1 },
                ],
              },
            },
          },
        ],
        items: [
          {
            id: 'pixel',
            name: 'Pixel',
            category: 'misc',
            workInProgress: false,
            notLoot: false,
            economy: { usage: [], tiers: [] },
            weight: 1,
            size: [1, 1],
            model: 'pixel',
            igniter: { capacity: 100, perIgnition: 1 },
          },
        ],
      },
    },
  ]);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  let failure: string | undefined;
  const models = new ModelLibrary(
    registry,
    (message) => {
      failure = message;
    },
    { 'assets/models/pixel.glb': url },
    1,
  );
  const pictures = new ItemPictures(registry, models, 4);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:10000';
  document.body.append(host);
  const viewer = new ItemViewer(
    () => host,
    () => pictures,
    () => ({
      framing: 1.1,
      startYawDegrees: 20,
      startPitchDegrees: 10,
      pitchLimitDegrees: 80,
      degreesPerPixel: 1,
      zoomPerWheelPixel: 0.01,
      zoomMin: 0.5,
      zoomMax: 2,
    }),
    () => 'Close',
  );
  const factory = new ItemFactory();
  return {
    ready: () => {
      if (failure) {
        throw new Error(failure);
      }
      return models.has('pixel');
    },
    capture: () => {
      const capture = (condition: number, charge: number) => {
        const item = factory.create(registry, 'pixel', 1, { condition });
        item.charges = charge;
        const before = JSON.stringify(snapshotItem(item));
        if (!viewer.open(item, 'Pixel')) {
          throw new Error('Fixture viewer failed to open');
        }
        const canvas = host.querySelector<HTMLCanvasElement>('canvas')!;
        const pixels = coloredPixels(canvas);
        viewer.close();
        if (JSON.stringify(snapshotItem(item)) !== before) {
          throw new Error('Viewer changed fixture state');
        }
        return pixels;
      };
      return { full: capture(1, 100), lowFuel: capture(1, 20), worn: capture(0.2, 100) };
    },
    dispose: () => {
      viewer.close();
      host.remove();
      pictures.dispose();
      URL.revokeObjectURL(url);
    },
  };
};
