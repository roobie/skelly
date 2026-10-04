// Only authored cellar sites allocate a field. Built-in tree/city workloads and shaders are unchanged.
import {
  Data3DTexture,
  LinearFilter,
  type Material,
  type Mesh,
  RedFormat,
  type Scene,
  UnsignedByteType,
  Vector3,
} from 'three';
import type { SolidAt } from '../core/raycast.ts';
import { buildSkylight, type SkyBounds, type SkyVolume, skyIndex } from '../core/skylight.ts';

export class Skylight {
  private readonly texture = { value: new Data3DTexture(new Uint8Array([0]), 1, 1, 1) };
  private readonly patched = new WeakSet<Material>();
  private revision = '';
  private volume: SkyVolume | undefined;
  private readonly bounds: SkyBounds;
  private readonly minimum: { value: Vector3 };
  private readonly extent: { value: Vector3 };

  private readonly blockSize: number;
  private readonly top: number;

  constructor(boxes: readonly SkyBounds[], blockSize: number, top: number) {
    this.blockSize = blockSize;
    this.top = top;
    this.bounds = {
      min: [0, 1, 2].map((axis) => Math.min(...boxes.map((box) => box.min[axis]!)) - 2) as SkyBounds['min'],
      max: [0, 1, 2].map((axis) => Math.max(...boxes.map((box) => box.max[axis]!)) + 2) as SkyBounds['max'],
    };
    this.minimum = { value: new Vector3(...this.bounds.min).multiplyScalar(blockSize) };
    this.extent = { value: new Vector3(...this.bounds.max).multiplyScalar(blockSize).sub(this.minimum.value) };
  }

  update(scene: Scene, revision: string, opaque: SolidAt): void {
    if (this.revision !== revision) {
      const volume = buildSkylight(this.bounds, this.top, opaque);
      this.volume = volume;
      const next = new Data3DTexture(volume.light, volume.size[0], volume.size[2], volume.size[1]);
      next.format = RedFormat;
      next.type = UnsignedByteType;
      next.minFilter = LinearFilter;
      next.magFilter = LinearFilter;
      next.unpackAlignment = 1;
      next.needsUpdate = true;
      this.texture.value.dispose();
      this.texture.value = next;
      this.revision = revision;
    }
    scene.traverse((object) => {
      const { material } = object as Mesh;
      if (!material) {
        return;
      }
      for (const entry of Array.isArray(material) ? material : [material]) {
        this.patch(entry);
      }
    });
  }

  /** Same local sky estimate as the world shader, for the existing flashlight adaptation model. Metres. */
  at(position: SkyBounds['min']): number {
    const cell = position.map(
      (value, axis) => Math.floor(value / this.blockSize) - this.bounds.min[axis]!,
    ) as SkyBounds['min'];
    const size = this.bounds.max.map((value, axis) => value - this.bounds.min[axis]!) as SkyBounds['min'];
    if (cell.some((value, axis) => value < 0 || value >= size[axis]!)) {
      return 1;
    }
    return this.volume ? this.volume.light[skyIndex(size, ...cell)]! / 255 : 0;
  }

  private patch(material: Material): void {
    if (this.patched.has(material)) {
      return;
    }
    this.patched.add(material);
    const compile = material.onBeforeCompile;
    const key = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      compile.call(material, shader, renderer);
      if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) {
        return;
      }
      shader.uniforms.uSkyVolume = this.texture;
      shader.uniforms.uSkyMinimum = this.minimum;
      shader.uniforms.uSkyExtent = this.extent;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSkyWorld;\nvarying vec3 vSkyNormal;')
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vec4 skyPosition = vec4(transformed, 1.0);
vec3 skyNormal = objectNormal;
#ifdef USE_INSTANCING
skyPosition = instanceMatrix * skyPosition;
skyNormal = mat3(instanceMatrix) * skyNormal;
#endif
vSkyWorld = (modelMatrix * skyPosition).xyz;
vSkyNormal = normalize(mat3(modelMatrix) * skyNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform highp sampler3D uSkyVolume;
uniform vec3 uSkyMinimum;
uniform vec3 uSkyExtent;
varying vec3 vSkyWorld;
varying vec3 vSkyNormal;
float skyVisibility() {
  vec3 cell = (vSkyWorld + normalize(vSkyNormal) * ${this.blockSize * 0.05} - uSkyMinimum) / uSkyExtent;
  if (any(lessThan(cell, vec3(0.0))) || any(greaterThanEqual(cell, vec3(1.0)))) return 1.0;
  return texture(uSkyVolume, cell.xzy).r;
}`,
        )
        .replace('#include <lights_fragment_end>', 'irradiance *= skyVisibility();\n#include <lights_fragment_end>');
    };
    material.customProgramCacheKey = () => `${key.call(material)}:bounded-voxel-skylight`;
    material.needsUpdate = true;
  }
}
