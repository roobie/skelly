import {
  Color,
  type Material,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type Side,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { OPTIC_BODY_LAYER } from './shadowFlags.ts';

/** The presented optic's opaque silhouette, so its image and reticle never paint over physical housing. */
export class OpticHousingMask {
  private readonly camera = new PerspectiveCamera();
  private readonly scene = new Scene();
  private readonly target = new WebGLRenderTarget(1, 1);
  private readonly meshes = new Map<Mesh, Mesh>();
  private readonly opaque = new Map<Side, MeshBasicMaterial>();
  private readonly hidden = new MeshBasicMaterial({ visible: false });

  get texture() {
    return this.target.texture;
  }

  // Glass must not join the silhouette, or the mask would close the window it bounds.
  private maskMaterial(source: Material): MeshBasicMaterial {
    if (!source.visible || source.transparent) {
      return this.hidden;
    }
    let material = this.opaque.get(source.side);
    if (!material) {
      material = new MeshBasicMaterial({ color: 0xff_ff_ff, side: source.side, fog: false, toneMapped: false });
      this.opaque.set(source.side, material);
    }
    return material;
  }

  private sync(scene: Scene): boolean {
    if (scene.matrixWorldAutoUpdate) {
      scene.updateMatrixWorld();
    }
    const seen = new Set<Mesh>();
    scene.traverseVisible((object) => {
      if (!(object instanceof Mesh && object.layers.isEnabled(OPTIC_BODY_LAYER))) {
        return;
      }
      const material = Array.isArray(object.material)
        ? object.material.map((entry) => this.maskMaterial(entry))
        : this.maskMaterial(object.material);
      const materials = Array.isArray(material) ? material : [material];
      if (materials.every((entry) => entry === this.hidden)) {
        return;
      }
      seen.add(object);
      let proxy = this.meshes.get(object);
      if (!proxy) {
        proxy = new Mesh(object.geometry, material);
        proxy.matrixAutoUpdate = false;
        proxy.layers.set(OPTIC_BODY_LAYER);
        this.meshes.set(object, proxy);
        this.scene.add(proxy);
      }
      proxy.geometry = object.geometry;
      proxy.material = material;
      proxy.matrix.copy(object.matrixWorld);
    });
    for (const [source, proxy] of this.meshes) {
      if (!seen.has(source)) {
        this.scene.remove(proxy);
        this.meshes.delete(source);
      }
    }
    return seen.size > 0;
  }

  prepare(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): boolean {
    if (!this.sync(scene)) {
      return false;
    }
    this.camera.copy(camera);
    this.camera.layers.set(OPTIC_BODY_LAYER);
    const size = renderer.getDrawingBufferSize(new Vector2());
    if (this.target.width !== size.x || this.target.height !== size.y) {
      this.target.setSize(size.x, size.y);
    }
    const previous = renderer.getRenderTarget();
    const clear = renderer.getClearColor(new Color());
    const alpha = renderer.getClearAlpha();
    const { autoClear } = renderer;
    try {
      renderer.autoClear = true;
      renderer.setClearColor(0, 1);
      renderer.setRenderTarget(this.target);
      // The world shadow owner schedules draws by scene identity; a mask must not consume its update.
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setClearColor(clear, alpha);
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
    return true;
  }

  dispose(): void {
    this.target.dispose();
    this.hidden.dispose();
    this.scene.clear();
    this.meshes.clear();
    for (const material of this.opaque.values()) {
      material.dispose();
    }
  }
}
