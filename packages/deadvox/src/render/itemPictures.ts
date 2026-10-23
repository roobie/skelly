import type { Object3D } from 'three';
import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { Registry } from '../core/content.ts';
import type { Item } from '../core/items.ts';
import { itemLook } from './itemLook.ts';
import { type ModelLibrary, visibleBounds } from './models.ts';

export interface PicturePainter {
  paint: (model: Object3D) => string;
  dispose: () => void;
}

type PictureRenderer = Pick<
  WebGLRenderer,
  'setSize' | 'setClearColor' | 'render' | 'domElement' | 'dispose' | 'forceContextLoss'
>;

/** A separate reference scene keeps pictures independent of world light and handling motion. */
export const referencePainter = (
  createRenderer: () => PictureRenderer = () => new WebGLRenderer({ alpha: true, antialias: true }),
): PicturePainter => {
  let renderer: PictureRenderer | undefined;
  let disposed = false;
  return {
    paint(model) {
      if (disposed) {
        throw new Error('Picture painter is disposed');
      }
      renderer ??= createRenderer();
      renderer.setSize(128, 128);
      renderer.setClearColor(0, 0);
      const scene = new Scene();
      scene.add(new AmbientLight(0xff_ff_ff, 2));
      const key = new DirectionalLight(0xff_ff_ff, 3);
      key.position.set(2, 3, 4);
      scene.add(key, model);
      const bounds = visibleBounds(model);
      const centre = bounds.getCenter(new Vector3());
      const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.001);
      const extent = radius * 1.1;
      const camera = new OrthographicCamera(-extent, extent, extent, -extent, radius * 0.01, radius * 10);
      camera.position.copy(centre).add(new Vector3(1, 0.7, 1).normalize().multiplyScalar(radius * 3));
      camera.lookAt(centre);
      renderer.render(scene, camera);
      const picture = renderer.domElement.toDataURL();
      scene.remove(model);
      return picture;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      renderer?.dispose();
      renderer?.forceContextLoss();
      renderer = undefined;
    },
  };
};

export class ItemPictures {
  private readonly cache = new Map<string, string>();

  private readonly registry: Registry;
  private readonly models: Pick<ModelLibrary, 'version' | 'has' | 'groundLook'>;
  private readonly painter: PicturePainter;
  private readonly capacity: number;
  private disposed = false;

  constructor(
    registry: Registry,
    models: Pick<ModelLibrary, 'version' | 'has' | 'groundLook'>,
    capacity: number,
    painter: PicturePainter = referencePainter(),
  ) {
    this.registry = registry;
    this.models = models;
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error('Picture cache capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.painter = painter;
  }

  get version(): number {
    return this.models.version;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cache.clear();
    this.painter.dispose();
  }

  picture(item: Item): string | undefined {
    if (this.disposed) {
      return undefined;
    }
    const look = itemLook(this.registry, item);
    if (!look) {
      return undefined;
    }
    const key = JSON.stringify(look);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    // ModelLibrary reports declared-model failures; waiting for all parts avoids a misleading partial still.
    if (!this.models.has(look.model) || look.slots.some((slot) => slot.model && !this.models.has(slot.model))) {
      return undefined;
    }
    const model = this.models.groundLook(look);
    if (!model) {
      return undefined;
    }
    const picture = this.painter.paint(model);
    if (this.cache.size === this.capacity) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(key, picture);
    return picture;
  }
}
