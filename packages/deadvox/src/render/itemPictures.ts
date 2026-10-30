import type { Object3D } from 'three';
import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { Registry } from '../core/content.ts';
import type { GridSize, Item } from '../core/items.ts';
import { itemLook } from './itemLook.ts';
import { applyItemStateLook, disposeItemStateMaterials } from './itemStateLook.ts';
import { ModelFlames } from './modelFlame.ts';
import { groundModelFrame, type ModelLibrary, visibleBounds } from './models.ts';

/** Where the reference camera sits around a model: radians, and a framing extent per bounding radius for views or a margin over projected still bounds. */
export interface ReferencePose {
  readonly yaw: number;
  readonly pitch: number;
  readonly framing: number;
}

export interface PicturePainter {
  paint: (model: Object3D, pose: ReferencePose, width: number, height: number) => string;
  /** Draws the model at a pose and returns the drawn surface; read it before the next paint or view. */
  view: (model: Object3D, pose: ReferencePose, width: number, height: number) => CanvasImageSource;
  dispose: () => void;
}

type PictureRenderer = Pick<
  WebGLRenderer,
  'setSize' | 'setClearColor' | 'render' | 'domElement' | 'dispose' | 'forceContextLoss'
>;

interface DrawOptions {
  readonly pose: ReferencePose;
  readonly width: number;
  readonly height: number;
  readonly fit: 'projected' | 'radius';
}

interface ItemPicturesOptions {
  readonly painter?: PicturePainter;
  readonly framing?: number;
}

/** The inventory still's pose: three-quarter view from the front right, slightly above. */
const PICTURE_POSE: ReferencePose = {
  yaw: Math.PI / 4,
  pitch: Math.atan2(0.7, Math.SQRT2),
  framing: 1.1,
};

const PICTURE_PIXELS_PER_CELL = 128;

/** The raster dimensions preserve a grid item's footprint, including its placed rotation. */
export const pictureSurfaceSize = ({ w, h }: GridSize): { readonly width: number; readonly height: number } => ({
  width: w * PICTURE_PIXELS_PER_CELL,
  height: h * PICTURE_PIXELS_PER_CELL,
});

/** The orthographic half-height that contains projected bounds while using as much of the surface as possible. */
export const fittedPictureExtent = (halfWidth: number, halfHeight: number, aspect: number, framing: number): number =>
  Math.max(halfHeight, halfWidth / aspect) * framing;

/** A separate reference scene keeps pictures independent of world light and handling motion. */
export const referencePainter = (
  createRenderer: () => PictureRenderer = () => new WebGLRenderer({ alpha: true, antialias: true }),
): PicturePainter => {
  let renderer: PictureRenderer | undefined;
  let disposed = false;
  const draw = (model: Object3D, { pose, width, height, fit }: DrawOptions): PictureRenderer => {
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
    const aspect = width / height;
    const camera = new OrthographicCamera(-1, 1, 1, -1, radius * 0.01, radius * 10);
    const direction = new Vector3(
      Math.cos(pose.pitch) * Math.sin(pose.yaw),
      Math.sin(pose.pitch),
      Math.cos(pose.pitch) * Math.cos(pose.yaw),
    );
    camera.position.copy(centre).add(direction.multiplyScalar(radius * 3));
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    let halfWidth = 0;
    let halfHeight = 0;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const point = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          halfWidth = Math.max(halfWidth, Math.abs(point.x));
          halfHeight = Math.max(halfHeight, Math.abs(point.y));
        }
      }
    }
    const extent =
      fit === 'projected'
        ? fittedPictureExtent(halfWidth, halfHeight, aspect, pose.framing)
        : (radius * pose.framing) / Math.min(aspect, 1);
    camera.left = -extent * aspect;
    camera.right = extent * aspect;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    scene.remove(model);
    return renderer;
  };
  return {
    paint(model, pose, width, height) {
      return draw(model, { pose, width, height, fit: 'projected' }).domElement.toDataURL();
    },
    view(model, pose, width, height) {
      return draw(model, { pose, width, height, fit: 'radius' }).domElement;
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
  private readonly flames = new ModelFlames('picture-light-flame');

  private readonly registry: Registry;
  private readonly models: Pick<ModelLibrary, 'version' | 'has' | 'groundLook'>;
  private readonly painter: PicturePainter;
  private readonly capacity: number;
  private readonly pose: ReferencePose;
  private disposed = false;

  constructor(
    registry: Registry,
    models: Pick<ModelLibrary, 'version' | 'has' | 'groundLook'>,
    capacity: number,
    { painter = referencePainter(), framing = PICTURE_POSE.framing }: ItemPicturesOptions = {},
  ) {
    this.registry = registry;
    this.models = models;
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error('Picture cache capacity must be a positive integer');
    }
    this.capacity = capacity;
    this.painter = painter;
    this.pose = { ...PICTURE_POSE, framing };
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
    this.flames.dispose();
  }

  picture(item: Item, footprint: GridSize = { w: 1, h: 1 }): string | undefined {
    if (this.disposed) {
      return undefined;
    }
    const look = itemLook(this.registry, item);
    if (!look) {
      return undefined;
    }
    const size = pictureSurfaceSize(footprint);
    const key = JSON.stringify([look, size]);
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
    let picture: string;
    try {
      picture = this.painter.paint(model, this.pose, size.width, size.height);
    } finally {
      this.disposeModel(model);
    }
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
    const model = this.models.groundLook(look);
    if (model) {
      applyItemStateLook(model, look, this.registry);
      this.flames.onModel(this.registry, item, model, groundModelFrame);
    }
    return model;
  }

  disposeModel(model: Object3D): void {
    disposeItemStateMaterials(model);
  }

  /** Draws a model from `model` with the pictures' own renderer, so the viewer needs no second context. */
  view(model: Object3D, pose: ReferencePose, width: number, height: number): CanvasImageSource | undefined {
    return this.disposed ? undefined : this.painter.view(model, pose, width, height);
  }
}
