import {
  type BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  type InterleavedBufferAttribute,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  type WebGLRenderer,
} from 'three';

type Attribute = BufferAttribute | InterleavedBufferAttribute;

/** Paces atomic buffer uploads without drawing, so shadow work cannot back-pressure the next upload. */
export class GpuUploads {
  private readonly uploaded = new WeakMap<object, number>();
  private readonly geometry = new BufferGeometry();
  private readonly material = new MeshBasicMaterial();
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera();

  private readonly renderer: WebGLRenderer;
  private readonly uploadsPerFrame: number;

  constructor(renderer: WebGLRenderer, uploadsPerFrame: number) {
    this.renderer = renderer;
    this.uploadsPerFrame = uploadsPerFrame;
    this.geometry.boundingSphere = new Sphere();
    // Zero reaches WebGLBindingStates.setup (which uploads indices); a negative count skips it.
    this.geometry.setDrawRange(0, 0);
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  warmUp(): Promise<unknown> {
    return this.renderer.compileAsync(this.scene, this.camera);
  }

  private instanceBuffers(object: InstancedMesh, add: (attribute: Attribute, index: boolean) => void): void {
    add(object.instanceMatrix, false);
    if (object.instanceColor) {
      add(object.instanceColor, false);
    }
  }

  /** Returns true only after every source buffer's latest version has reached the renderer. */
  step(roots: readonly Object3D[]): boolean {
    const pending = new Map<object, { attribute: Attribute; index: boolean; version: number }>();
    const add = (attribute: Attribute, index: boolean): void => {
      const buffer = 'isInterleavedBufferAttribute' in attribute ? attribute.data : attribute;
      if (this.uploaded.get(buffer) !== buffer.version) {
        pending.set(buffer, { attribute, index, version: buffer.version });
      }
    };
    for (const root of roots) {
      root.traverse((object) => {
        const { geometry } = object as Mesh;
        if (!(geometry instanceof BufferGeometry)) {
          return;
        }
        for (const attribute of Object.values(geometry.attributes)) {
          add(attribute, false);
        }
        if (geometry.index) {
          add(geometry.index, true);
        }
        if (object instanceof InstancedMesh) {
          this.instanceBuffers(object, add);
        }
      });
    }
    let remaining = this.uploadsPerFrame;
    const { autoClear } = this.renderer;
    this.renderer.autoClear = false;
    try {
      for (const [buffer, { attribute, index, version }] of pending) {
        if (remaining === 0) {
          return false;
        }
        if (index) {
          this.geometry.setIndex(attribute as BufferAttribute);
        } else {
          // Upload as an inactive attribute: instance matrices are not valid position bindings.
          this.geometry.setAttribute('upload', attribute);
        }
        this.renderer.render(this.scene, this.camera);
        // The source geometry owns these buffers; disposing the staging geometry must not free them.
        this.geometry.deleteAttribute('upload');
        this.geometry.setIndex(null);
        this.uploaded.set(buffer, version);
        remaining -= 1;
      }
      return true;
    } finally {
      this.renderer.autoClear = autoClear;
    }
  }

  dispose(): void {
    this.geometry.deleteAttribute('upload');
    this.geometry.setIndex(null);
    this.geometry.dispose();
    this.material.dispose();
  }
}
