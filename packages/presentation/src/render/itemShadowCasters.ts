import {
  Box3,
  type BufferGeometry,
  InstancedMesh,
  Matrix4,
  type Mesh,
  type PointLight,
  SkinnedMesh,
  Sphere,
} from 'three';

interface Entry {
  mesh: Mesh;
  box: Box3;
  sphere: Sphere;
  /** What the bounds were taken from; a caster is measured again only when one of these changes. */
  matrix: Matrix4;
  geometry: BufferGeometry;
  count: number;
  instances: number;
}

/**
 * World-space caster bounds shared by every lamp rather than rediscovered on each cube face, and kept across frames:
 * a caster is measured again only when its placement changes, and the index re-sorted only when a bound or the set
 * does. Instance placements count as changed through their attribute's version, which an upload needs anyway.
 */
export class ItemShadowCasters {
  /** Undefined until the first update, which always takes the set. */
  private casters: readonly Mesh[] | undefined;
  private order = new Map<Mesh, number>();
  private readonly measured = new Map<Mesh, Entry>();
  private entries: Entry[] = [];
  private width = 0;
  private unbounded: Mesh[] = [];

  /** Takes this frame's casters in drawing order; returns whether the set differs from the last frame's. */
  update(casters: readonly Mesh[]): boolean {
    const taken = this.casters;
    const changed = !taken || casters.length !== taken.length || casters.some((mesh, index) => mesh !== taken[index]);
    if (changed) {
      this.takeSet(casters);
    }
    let moved = false;
    const entries: Entry[] = [];
    const unbounded: Mesh[] = [];
    for (const mesh of casters) {
      const bounds = boundsOf(mesh);
      if (bounds !== 'bounded') {
        this.measured.delete(mesh);
        if (bounds === 'unbounded') {
          unbounded.push(mesh);
        }
        continue;
      }
      const known = this.measured.get(mesh);
      const entry = known ?? this.entryOf(mesh);
      if (!known || stale(entry)) {
        measure(entry);
        moved = true;
      }
      entries.push(entry);
    }
    this.unbounded = unbounded;
    if (moved || entries.length !== this.entries.length) {
      this.entries = entries.sort((a, b) => a.box.min.x - b.box.min.x);
      this.width = entries.reduce((width, { box }) => Math.max(width, box.max.x - box.min.x), 0);
    }
    return changed;
  }

  private takeSet(casters: readonly Mesh[]): void {
    this.casters = [...casters];
    this.order = new Map(casters.map((mesh, index) => [mesh, index]));
    for (const mesh of this.measured.keys()) {
      if (!this.order.has(mesh)) {
        this.measured.delete(mesh);
      }
    }
  }

  private entryOf(mesh: Mesh): Entry {
    const entry = {
      mesh,
      box: new Box3(),
      sphere: new Sphere(),
      matrix: new Matrix4(),
      geometry: mesh.geometry,
      count: -1,
      instances: -1,
    };
    this.measured.set(mesh, entry);
    return entry;
  }

  /** A bounded caster's world bounding sphere, as last measured. */
  sphereOf(mesh: Mesh): Sphere | undefined {
    return this.measured.get(mesh)?.sphere;
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

const boundsOf = (mesh: Mesh): 'empty' | 'unbounded' | 'bounded' => {
  if (mesh instanceof InstancedMesh && mesh.count === 0) {
    return 'empty';
  }
  // Geometry bounds cannot prove shader-placed or skeletal vertices stay outside a lamp's reach.
  return !mesh.frustumCulled || mesh instanceof SkinnedMesh ? 'unbounded' : 'bounded';
};

const stale = ({ mesh, matrix, geometry, count, instances }: Entry): boolean =>
  mesh.geometry !== geometry ||
  !matrix.equals(mesh.matrixWorld) ||
  (mesh instanceof InstancedMesh && (mesh.count !== count || mesh.instanceMatrix.version !== instances));

const measure = (entry: Entry): void => {
  const { mesh, sphere } = entry;
  if (mesh instanceof InstancedMesh) {
    mesh.computeBoundingSphere();
    sphere.copy(mesh.boundingSphere!);
    entry.count = mesh.count;
    entry.instances = mesh.instanceMatrix.version;
  } else {
    if (!mesh.geometry.boundingSphere) {
      mesh.geometry.computeBoundingSphere();
    }
    sphere.copy(mesh.geometry.boundingSphere!);
  }
  entry.geometry = mesh.geometry;
  entry.matrix.copy(mesh.matrixWorld);
  sphere.applyMatrix4(mesh.matrixWorld);
  sphere.getBoundingBox(entry.box);
};
