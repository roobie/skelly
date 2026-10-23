import type { Object3D } from 'three';
import { AmbientLight, DirectionalLight, OrthographicCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { Registry } from '../core/content.ts';
import type { Item } from '../core/items.ts';
import { itemLook } from './itemLook.ts';
import { type ModelLibrary, visibleBounds } from './models.ts';

/** A separate reference scene keeps pictures independent of world light and handling motion. */
const referencePainter = (): ((model: Object3D) => string) => {
  let renderer: WebGLRenderer | undefined;
  return (model) => {
    renderer ??= new WebGLRenderer({ alpha: true, antialias: true });
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
  };
};

export class ItemPictures {
  private readonly cache = new Map<string, string>();

  private readonly registry: Registry;
  private readonly models: Pick<ModelLibrary, 'version' | 'has' | 'groundLook'>;
  private readonly paint: (model: Object3D) => string;

  constructor(
    registry: Registry,
    models: Pick<ModelLibrary, 'version' | 'has' | 'groundLook'>,
    paint: (model: Object3D) => string = referencePainter(),
  ) {
    this.registry = registry;
    this.models = models;
    this.paint = paint;
  }

  get version(): number {
    return this.models.version;
  }

  picture(item: Item): string | undefined {
    const look = itemLook(this.registry, item);
    if (!look) {
      return undefined;
    }
    const key = JSON.stringify(look);
    const cached = this.cache.get(key);
    if (cached !== undefined) {
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
    const picture = this.paint(model);
    this.cache.set(key, picture);
    return picture;
  }
}
