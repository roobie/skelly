import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Scene } from 'three';
import type { Vec3 } from '../core/coords.ts';

export type DebugPrimitive =
  | { kind: 'line'; start: Vec3; end: Vec3; color: number; expiresAtRealMs: number }
  | { kind: 'box'; min: Vec3; max: Vec3; color: number; expiresAtRealMs: number }
  | { kind: 'point'; at: Vec3; size: number; color: number; expiresAtRealMs: number };

interface DebugDrawOptions {
  durationRealMs?: number;
  color?: number;
}

const SEGMENTS_PER_PRIMITIVE = 12;
const BOX_EDGES = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
] as const;

/** Bounded, Real-time-lived world-space lines; boxes and points are batched as line segments too. */
export class TransientDebugDraw {
  readonly dropped = { count: 0 };
  private readonly entries: DebugPrimitive[] = [];
  private readonly geometry?: BufferGeometry;
  private readonly positions?: Float32Array;
  private readonly colors?: Float32Array;
  private readonly mesh?: LineSegments;
  private readonly capacity: number;

  constructor(scene: Scene, enabled: boolean, capacity = 256) {
    this.capacity = capacity;
    if (!enabled) {
      return;
    }
    this.positions = new Float32Array(capacity * SEGMENTS_PER_PRIMITIVE * 6);
    this.colors = new Float32Array(capacity * SEGMENTS_PER_PRIMITIVE * 6);
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);
    this.mesh = new LineSegments(this.geometry, new LineBasicMaterial({ vertexColors: true }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  get enabled(): boolean {
    return this.mesh !== undefined;
  }

  meshVertexCount(): number {
    return this.geometry?.drawRange.count ?? 0;
  }

  line(start: Vec3, end: Vec3, nowMs: number, options: DebugDrawOptions = {}): void {
    const { durationRealMs = 0, color = 0x66_dd_ff } = options;
    this.push({ kind: 'line', start, end, color, expiresAtRealMs: nowMs + Math.max(1, durationRealMs) });
  }

  box(min: Vec3, max: Vec3, nowMs: number, options: DebugDrawOptions = {}): void {
    const { durationRealMs = 0, color = 0x66_dd_ff } = options;
    this.push({ kind: 'box', min, max, color, expiresAtRealMs: nowMs + Math.max(1, durationRealMs) });
  }

  point(at: Vec3, nowMs: number, options: DebugDrawOptions & { size?: number } = {}): void {
    const { durationRealMs = 0, color = 0x66_dd_ff, size = 0.08 } = options;
    this.push({ kind: 'point', at, size, color, expiresAtRealMs: nowMs + Math.max(1, durationRealMs) });
  }

  /** Expire entries and rewrite the existing buffer before the scene render; no frame-time allocation. */
  update(nowMs: number): void {
    if (!(this.mesh && this.geometry && this.positions && this.colors)) {
      return;
    }
    let live = 0;
    for (const entry of this.entries) {
      if (entry.expiresAtRealMs > nowMs) {
        this.entries[live] = entry;
        live += 1;
      }
    }
    this.entries.length = live;
    let vertex = 0;
    for (const entry of this.entries) {
      if (entry.kind === 'line') {
        vertex = this.segment(entry.start, entry.end, entry.color, vertex);
      } else if (entry.kind === 'box') {
        const { min, max } = entry;
        const corners: Vec3[] = [
          [min[0], min[1], min[2]],
          [max[0], min[1], min[2]],
          [min[0], max[1], min[2]],
          [max[0], max[1], min[2]],
          [min[0], min[1], max[2]],
          [max[0], min[1], max[2]],
          [min[0], max[1], max[2]],
          [max[0], max[1], max[2]],
        ];
        for (const [a, b] of BOX_EDGES) {
          vertex = this.segment(corners[a]!, corners[b]!, entry.color, vertex);
        }
      } else {
        const {
          at: [x, y, z],
          size,
        } = entry;
        vertex = this.segment([x - size, y, z], [x + size, y, z], entry.color, vertex);
        vertex = this.segment([x, y - size, z], [x, y + size, z], entry.color, vertex);
        vertex = this.segment([x, y, z - size], [x, y, z + size], entry.color, vertex);
      }
    }
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
    this.geometry.setDrawRange(0, vertex);
  }

  private push(entry: DebugPrimitive): void {
    if (!this.mesh) {
      return;
    }
    if (this.entries.length === this.capacity) {
      this.entries.shift();
      this.dropped.count += 1;
    }
    this.entries.push(entry);
  }

  private segment(a: Vec3, b: Vec3, color: number, vertex: number): number {
    const p = this.positions!;
    const c = this.colors!;
    const offset = vertex * 3;
    p.set(a, offset);
    p.set(b, offset + 3);
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const bl = (color & 0xff) / 255;
    c[offset] = r;
    c[offset + 1] = g;
    c[offset + 2] = bl;
    c[offset + 3] = r;
    c[offset + 4] = g;
    c[offset + 5] = bl;
    return vertex + 2;
  }
}
