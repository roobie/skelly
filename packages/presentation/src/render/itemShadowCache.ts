import {
  type BufferGeometry,
  InstancedMesh,
  type Mesh,
  type MeshStandardMaterial,
  type PointLight,
  Sphere,
} from 'three';

/** Compare drawn inputs, not model identity: worn models can be recloned without changing their shadows. */
export class ItemShadowCache {
  private readonly previous = new Map<number, readonly unknown[]>();
  private readonly sphere = new Sphere();

  private readonly measured: (mesh: Mesh) => Sphere | undefined;

  /** `measured` gives a caster's world bounding sphere when it is already known this frame. */
  constructor(measured: (mesh: Mesh) => Sphere | undefined = () => undefined) {
    this.measured = measured;
  }

  changed(slot: number, light: PointLight, casters: readonly Mesh[], extra: readonly unknown[]): boolean {
    let changingVertexShader = false;
    const inputs: unknown[] = [
      ...light.position.toArray(),
      light.distance,
      light.intensity > 0,
      light.userData.carried,
      ...extra,
    ];
    for (const mesh of casters) {
      if (!this.inRange(mesh, light, this.measured(mesh))) {
        continue;
      }
      this.appendMesh(inputs, mesh);
      // An unowned vertex shader cannot be proved unchanged by matrices and geometry alone.
      changingVertexShader ||= Boolean(mesh.customDepthMaterial || mesh.customDistanceMaterial);
    }
    const previous = this.previous.get(slot);
    this.previous.set(slot, inputs);
    return (
      changingVertexShader ||
      !previous ||
      previous.length !== inputs.length ||
      inputs.some((value, index) => value !== previous[index])
    );
  }

  private inRange(mesh: Mesh, light: PointLight, measured: Sphere | undefined): boolean {
    if (measured) {
      this.sphere.copy(measured);
    } else if (mesh instanceof InstancedMesh) {
      if (mesh.count === 0) {
        return false;
      }
      mesh.computeBoundingSphere();
      if (mesh.boundingSphere) {
        this.sphere.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld);
      }
    } else {
      if (!mesh.geometry.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      this.sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
    }
    // Custom vertex placement can invalidate ordinary geometry bounds; retain these conservatively.
    return !mesh.frustumCulled || this.sphere.distanceToPoint(light.position) <= light.distance;
  }

  private appendMesh(inputs: unknown[], mesh: Mesh): void {
    const geometry: BufferGeometry = mesh.geometry;
    inputs.push(
      geometry,
      ...mesh.matrixWorld.elements,
      geometry.index?.version,
      geometry.drawRange.start,
      geometry.drawRange.count,
    );
    for (const attr of Object.values(geometry.attributes)) {
      inputs.push(attr, 'version' in attr ? attr.version : attr.data.version);
    }
    if (mesh instanceof InstancedMesh) {
      inputs.push(mesh.count, ...mesh.instanceMatrix.array.subarray(0, mesh.count * 16));
    }
    if (mesh.morphTargetInfluences) {
      inputs.push(...mesh.morphTargetInfluences);
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const surface = material as Partial<MeshStandardMaterial>;
      inputs.push(
        material,
        material.version,
        material.visible,
        material.shadowSide,
        material.alphaTest,
        surface.map,
        surface.map?.version,
        surface.alphaMap,
        surface.alphaMap?.version,
        surface.displacementMap,
        surface.displacementMap?.version,
        surface.displacementScale,
        surface.displacementBias,
      );
    }
  }
}
