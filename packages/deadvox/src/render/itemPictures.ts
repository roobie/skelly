import type { Object3D } from 'three';
import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { Registry } from '../core/content.ts';
import type { Item } from '../core/items.ts';
import { itemLook } from './itemLook.ts';
import { type ModelLibrary, visibleBounds } from './models.ts';

/** Where the reference camera sits around a model: radians, and a framing extent per bounding radius. */
export interface ReferencePose {
  readonly yaw: number;
  readonly pitch: number;
  readonly framing: number;
}

export interface PicturePainter {
  paint: (model: Object3D) => string;
  /** Draws the model at a pose and returns the drawn surface; read it before the next paint or view. */
  view: (model: Object3D, pose: ReferencePose, width: number, height: number) => CanvasImageSource;
  dispose: () => void;
}

type PictureRenderer = Pick<
  WebGLRenderer,
  'setSize' | 'setClearColor' | 'render' | 'domElement' | 'dispose' | 'forceContextLoss'
>;

/** The inventory still's pose: three-quarter view from the front right, slightly above. */
const PICTURE_POSE: ReferencePose = {
  yaw: Math.PI / 4,
  pitch: Math.atan2(0.7, Math.SQRT2),
  framing: 1.1,
};

/** A separate reference scene keeps pictures independent of world light and handling motion. */
export const referencePainter = (
  createRenderer: () => PictureRenderer = () => new WebGLRenderer({ alpha: true, antialias: true }),
): PicturePainter => {
  let renderer: PictureRenderer | undefined;
  let disposed = false;
  const draw = (model: Object3D, pose: ReferencePose, width: number, height: number): PictureRenderer => {
    if (disposed) {
      throw new Error('Picture painter is disposed');
    }
    renderer ??= createRenderer();
    renderer.setSize(width, height);
    renderer.setClearColor(0, 0);
    const scene = new Scene();
    scene.add(new AmbientLight(0xff_ff_ff, 2));
    const key = new DirectionalLight(0xff_ff_ff, 3);
    key.position.set(2, 3, 4);
    scene.add(key, model);
    const bounds = visibleBounds(model);
    const centre = bounds.getCenter(new Vector3());
    const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.001);
    const extent = radius * pose.framing;
    const aspect = width / height;
    const camera = new OrthographicCamera(
      -extent * aspect,
      extent * aspect,
      extent,
      -extent,
      radius * 0.01,
      radius * 10,
    );
    const direction = new Vector3(
      Math.cos(pose.pitch) * Math.sin(pose.yaw),
      Math.sin(pose.pitch),
      Math.cos(pose.pitch) * Math.cos(pose.yaw),
    );
    camera.position.copy(centre).add(direction.multiplyScalar(radius * 3));
    camera.lookAt(centre);
    renderer.render(scene, camera);
    scene.remove(model);
    return renderer;
  };
  return {
    paint(model) {
      return draw(model, PICTURE_POSE, 128, 128).domElement.toDataURL();
    },
    view(model, pose, width, height) {
      return draw(model, pose, width, height).domElement;
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
    const model = this.model(item);
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

  /** The item instance's own ground model, as the world draws it; undefined until every part has loaded. */
  model(item: Item): Object3D | undefined {
    const look = this.disposed ? undefined : itemLook(this.registry, item);
    // ModelLibrary reports declared-model failures; waiting for all parts avoids a misleading partial model.
    if (
      !(look && this.models.has(look.model)) ||
      look.slots.some((slot) => slot.model && !this.models.has(slot.model))
    ) {
      return undefined;
    }
    return this.models.groundLook(look);
  }

  /** Draws a model from `model` with the pictures' own renderer, so the viewer needs no second context. */
  view(model: Object3D, pose: ReferencePose, width: number, height: number): CanvasImageSource | undefined {
    return this.disposed ? undefined : this.painter.view(model, pose, width, height);
  }
}
