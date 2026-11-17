import {
  BackSide,
  type Camera,
  FrontSide,
  type Material,
  Mesh,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  type MeshStandardMaterial,
  type Scene,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/** compileAsync does not visit the shadow renderer's depth and distance materials. */
export class ShadowPrograms {
  private readonly materials: Material[] = [];
  private readonly target = new WebGLRenderTarget(1, 1);

  private materialFor(source: Material, custom: Material | undefined, point: boolean): Material {
    const material = custom ?? (point ? new MeshDistanceMaterial() : new MeshDepthMaterial());
    if (!custom) {
      this.materials.push(material);
    }
    const surface = source as MeshStandardMaterial;
    const shadow = material as MeshDepthMaterial;
    shadow.map = surface.map;
    shadow.alphaMap = surface.alphaMap;
    shadow.alphaTest = surface.alphaToCoverage ? 0.5 : surface.alphaTest;
    shadow.displacementMap = surface.displacementMap;
    shadow.displacementScale = surface.displacementScale;
    shadow.displacementBias = surface.displacementBias;
    let { side } = surface;
    if (side === FrontSide) {
      side = BackSide;
    } else if (side === BackSide) {
      side = FrontSide;
    }
    shadow.side = surface.shadowSide ?? side;
    return material;
  }

  async warmUp(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    { point, lighting }: { point: boolean; lighting: Scene },
  ): Promise<void> {
    const compiling: Promise<unknown>[] = [];
    const previous = renderer.getRenderTarget();
    const { fog, environment } = lighting;
    // Shadow draws pass no scene to renderBufferDirect, but retain the main draw's light state.
    lighting.fog = null;
    lighting.environment = null;
    renderer.setRenderTarget(this.target);
    try {
      scene.traverse((object) => {
        if (!(object instanceof Mesh && object.castShadow)) {
          return;
        }
        const original = object.material;
        try {
          const custom = point ? object.customDistanceMaterial : object.customDepthMaterial;
          for (const source of Array.isArray(original) ? original : [original]) {
            object.material = this.materialFor(source, custom, point);
            compiling.push(renderer.compileAsync(object, camera, lighting));
          }
        } finally {
          object.material = original;
        }
      });
    } finally {
      renderer.setRenderTarget(previous);
      lighting.fog = fog;
      lighting.environment = environment;
    }
    await Promise.all(compiling);
  }

  dispose(): void {
    for (const material of this.materials) {
      material.dispose();
    }
    this.target.dispose();
  }
}
