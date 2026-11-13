// Every chunk's terrain lives in one BatchedMesh, so the main pass and each shadow pass draw all of it
// in one multi-draw call instead of one call per chunk; at a wide view radius the per-chunk calls were
// the cost. three builds a batch's draw list from instance visibility inside the object's own render
// hooks, after `renderer.render` has run the shadow passes, so each pass's chunk set is kept here and
// applied in its hook (`showPass`): the shadow passes draw their casters and the main pass the camera's
// chunks, whatever order they run in.

import type { Vec3 } from '@skelly/engine/world';
import { BatchedMesh, type BufferGeometry, type Material, Matrix4 } from 'three';

export type ChunkPass = 'main' | 'shadow';

const INITIAL_INSTANCES = 256;
// Above 65535, so three makes the batch's index 32-bit from the start, like the mesher's.
const INITIAL_VERTICES = 1 << 17;
// The mesher emits quads: four vertices, six indices.
const INDICES_PER_VERTEX = 1.5;
/** Free room left after the buffers grow, so streaming more chunks in doesn't regrow them every time. */
const GROWTH_HEADROOM = 0.5;

/** Chunk geometry is in blocks, placed at its chunk's origin; the batch scales it to metres. */
export class ChunkBatch extends BatchedMesh {
  /** Each instance's visibility per pass. */
  private readonly passes = new Map<number, Record<ChunkPass, boolean>>();
  /** Geometry ranges of removed chunks, reused by arriving chunks that fit until the buffers are repacked. */
  private readonly spares = new Set<number>();
  private vertexCapacity = INITIAL_VERTICES;
  private indexCapacity = INITIAL_VERTICES * INDICES_PER_VERTEX;
  private readonly placement = new Matrix4();
  private readonly range = {
    vertexStart: 0,
    vertexCount: 0,
    reservedVertexCount: 0,
    indexStart: 0,
    indexCount: 0,
    reservedIndexCount: 0,
    start: 0,
    count: 0,
  };

  constructor(material: Material, blockSize: number) {
    super(INITIAL_INSTANCES, INITIAL_VERTICES, INITIAL_VERTICES * INDICES_PER_VERTEX, material);
    this.scale.setScalar(blockSize);
    this.frustumCulled = false; // chunks.ts `cull` culls each chunk by its tight box
    this.perObjectFrustumCulled = false;
    // `sortObjects` stays on: front-to-back order, as three gave the separate chunk meshes, keeps the
    // early depth test rejecting hidden fragments of the heavy chunk shader.
    this.castShadow = true;
    this.receiveShadow = true;
  }

  /** Adds a chunk's geometry at `origin` (in blocks) and returns its instance, drawn in no pass yet. */
  addChunk(geometry: BufferGeometry, origin: Readonly<Vec3>): number {
    if (this.instanceCount >= this.maxInstanceCount) {
      this.setInstanceCount(this.maxInstanceCount * 2);
    }
    const instance = this.addInstance(this.slotFor(geometry));
    this.setMatrixAt(instance, this.placement.makeTranslation(...origin));
    this.setVisibleAt(instance, false);
    this.passes.set(instance, { main: false, shadow: false });
    return instance;
  }

  removeChunk(instance: number): void {
    this.spares.add(this.getGeometryIdAt(instance));
    this.deleteInstance(instance);
    this.passes.delete(instance);
  }

  setPassVisible(instance: number, pass: ChunkPass, visible: boolean): void {
    this.passes.get(instance)![pass] = visible;
  }

  isPassVisible(instance: number, pass: ChunkPass): boolean {
    return this.passes.get(instance)![pass];
  }

  override onBeforeRender(...hook: Parameters<BatchedMesh['onBeforeRender']>): void {
    this.showPass('main');
    super.onBeforeRender(...hook);
  }

  // BatchedMesh's shadow hook goes through `onBeforeRender`, which shows the main pass's set; so the
  // shadow set is shown here and the draw list built with the base class's hook directly.
  override onBeforeShadow(
    ...[renderer, scene, , shadowCamera, geometry, depthMaterial, group]: Parameters<BatchedMesh['onBeforeShadow']>
  ): void {
    this.showPass('shadow');
    super.onBeforeRender(renderer, scene, shadowCamera, geometry, depthMaterial, group);
  }

  private showPass(pass: ChunkPass): void {
    for (const [instance, visible] of this.passes) {
      this.setVisibleAt(instance, visible[pass]);
    }
  }

  /** A geometry id holding `geometry`: the best-fitting spare range, else a new range. */
  private slotFor(geometry: BufferGeometry): number {
    const vertices = geometry.getAttribute('position').count;
    const indices = geometry.getIndex()!.count;
    let best: number | undefined;
    let bestVertices = Number.POSITIVE_INFINITY;
    for (const slot of this.spares) {
      const { reservedVertexCount, reservedIndexCount } = this.getGeometryRangeAt(slot, this.range)!;
      if (reservedVertexCount >= vertices && reservedIndexCount >= indices && reservedVertexCount < bestVertices) {
        best = slot;
        bestVertices = reservedVertexCount;
      }
    }
    if (best !== undefined) {
      this.spares.delete(best);
      return this.setGeometryAt(best, geometry);
    }
    this.makeRoom(vertices, indices);
    return this.addGeometry(geometry);
  }

  /** Repacks the buffers, dropping the spare ranges, and grows them if the new range still doesn't fit. */
  private makeRoom(vertices: number, indices: number): void {
    if (this.unusedVertexCount >= vertices && this.unusedIndexCount >= indices) {
      return;
    }
    for (const slot of this.spares) {
      this.deleteGeometry(slot);
    }
    this.spares.clear();
    this.optimize();
    if (this.unusedVertexCount >= vertices && this.unusedIndexCount >= indices) {
      return;
    }
    const grown = (capacity: number, unused: number, needed: number): number =>
      Math.max(capacity, Math.ceil((capacity - unused + needed) * (1 + GROWTH_HEADROOM)));
    this.vertexCapacity = grown(this.vertexCapacity, this.unusedVertexCount, vertices);
    this.indexCapacity = grown(this.indexCapacity, this.unusedIndexCount, indices);
    this.setGeometrySize(this.vertexCapacity, this.indexCapacity);
  }
}
