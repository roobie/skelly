import { Box3, InstancedMesh, type Mesh, type PointLight, SkinnedMesh, Sphere } from 'three';

interface Entry {
  mesh: Mesh;
  box: Box3;
}

/** One frame's world-space caster bounds, shared by every lamp rather than rediscovered on each cube face. */
export class ItemShadowCasters {
  private readonly entries: Entry[];
  private readonly width: number;
  private readonly unbounded: Mesh[] = [];
  private readonly order: Map<Mesh, number>;

  constructor(casters: readonly Mesh[]) {
    this.order = new Map(casters.map((mesh, index) => [mesh, index]));
    const sphere = new Sphere();
    const entries: Entry[] = [];
    for (const mesh of casters) {
      if (mesh instanceof InstancedMesh && mesh.count === 0) {
        continue;
      }
      // Geometry bounds cannot prove shader-placed or skeletal vertices stay outside a lamp's reach.
      if (!mesh.frustumCulled || mesh instanceof SkinnedMesh) {
        this.unbounded.push(mesh);
        continue;
      }
      if (mesh instanceof InstancedMesh) {
        mesh.computeBoundingSphere();
        sphere.copy(mesh.boundingSphere!);
      } else {
        if (!mesh.geometry.boundingSphere) {
          mesh.geometry.computeBoundingSphere();
        }
        sphere.copy(mesh.geometry.boundingSphere!);
      }
      sphere.applyMatrix4(mesh.matrixWorld);
      entries.push({ mesh, box: sphere.getBoundingBox(new Box3()) });
    }
    this.entries = entries.sort((a, b) => a.box.min.x - b.box.min.x);
    this.width = entries.reduce((width, { box }) => Math.max(width, box.max.x - box.min.x), 0);
  }

  query(light: PointLight): Mesh[] {
    const found = [...this.unbounded];
    const radius = light.distance || Number.POSITIVE_INFINITY;
    const minimum = light.position.x - radius - this.width;
    const maximum = light.position.x + radius;
    let low = 0;
    let high = this.entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.entries[middle]!.box.min.x < minimum) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    for (let index = low; index < this.entries.length; index++) {
      const { box, mesh } = this.entries[index]!;
      if (box.min.x > maximum) {
        break;
      }
      if (box.distanceToPoint(light.position) <= radius) {
        found.push(mesh);
      }
    }
    return found.sort((a, b) => this.order.get(a)! - this.order.get(b)!);
  }
}
