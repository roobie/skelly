import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Scene } from 'three';
import type { Vec3 } from '../core/coords.ts';
import {
  type GunProxy,
  proxyContact,
  type WallBox,
  type WallComparison,
  type WallMode,
  type WallTuning,
} from './wallLeeway.ts';

/** Legend colours; the report's legend names the same ones. */
const WALL_COLOURS = {
  cells: [1, 0.55, 0],
  refined: [0, 0.9, 1],
  unrefined: [1, 0, 1],
  intended: [1, 1, 1],
  lowered: [0.2, 1, 0.3],
  unresolved: [1, 0.1, 0.1],
} as const satisfies Record<string, Vec3>;

const EDGES = [
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
/** Boxes farther than this from the swept proxy are left undrawn so the floor does not bury the samples. */
const DRAW_WITHIN_METRES = 0.75;
const RING_SEGMENTS = 16;

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v) || 1;
  return v.map((value) => value / length) as Vec3;
};

/** Debug-only wireframes for the wall spike: boxes per mode, the proxy envelopes and both hit markers. */
export class WallLeewayOverlay {
  private readonly line: LineSegments<BufferGeometry, LineBasicMaterial>;
  private position = new BufferAttribute(new Float32Array(0), 3);
  private colour = new BufferAttribute(new Float32Array(0), 3);
  private readonly vertices: number[] = [];
  private readonly colours: number[] = [];

  constructor(scene: Scene) {
    this.line = new LineSegments(
      new BufferGeometry(),
      new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    this.line.frustumCulled = false;
    this.line.renderOrder = 1000;
    scene.add(this.line);
  }

  update(comparison: WallComparison | undefined, mode: WallMode, tuning: WallTuning): void {
    this.vertices.length = 0;
    this.colours.length = 0;
    if (!comparison) {
      this.flush();
      return;
    }
    const lowered = comparison.modes[mode].lowering;
    this.nearBoxes(comparison, lowered.proxy);
    this.capsule(comparison.intended, WALL_COLOURS.intended);
    this.capsule(lowered.proxy, lowered.resolved ? WALL_COLOURS.lowered : WALL_COLOURS.unresolved);
    // The margin shell around the lowered proxy, so the clearance it must keep is visible.
    this.capsule({ ...lowered.proxy, radius: lowered.proxy.radius + tuning.marginMetres }, WALL_COLOURS.lowered, 8);
    for (const shown of ['cells', 'refined'] as const) {
      const { hit, from } = comparison.modes[shown].contact;
      if (hit && from) {
        this.cross(hit, 0.04, WALL_COLOURS[shown]);
        this.segment(from, hit, WALL_COLOURS[shown]);
      }
    }
    this.flush();
  }

  dispose(): void {
    this.line.removeFromParent();
    this.line.geometry.dispose();
    this.line.material.dispose();
  }

  /** Each mode's boxes near the intended or the lowered proxy. */
  private nearBoxes(comparison: WallComparison, lowered: GunProxy): void {
    const near = (box: WallBox) =>
      [comparison.intended, lowered].some((proxy) => proxyContact(proxy, [box]).clearance <= DRAW_WITHIN_METRES);
    for (const shown of ['cells', 'refined'] as const) {
      for (const box of comparison.modes[shown].boxes.filter(near)) {
        this.box(box, box.unrefined ? WALL_COLOURS.unrefined : WALL_COLOURS[shown]);
      }
    }
  }

  private segment(a: Vec3, b: Vec3, colour: Vec3): void {
    this.vertices.push(...a, ...b);
    this.colours.push(...colour, ...colour);
  }

  private box(box: WallBox, colour: Vec3): void {
    const corners = Array.from(
      { length: 8 },
      (_, index) =>
        [
          index & 1 ? box.max[0] : box.min[0],
          index & 2 ? box.max[1] : box.min[1],
          index & 4 ? box.max[2] : box.min[2],
        ] as Vec3,
    );
    for (const [a, b] of EDGES) {
      this.segment(corners[a]!, corners[b]!, colour);
    }
  }

  private cross(at: Vec3, size: number, colour: Vec3): void {
    for (let axis = 0; axis < 3; axis++) {
      const a = at.map((value, index) => (index === axis ? value - size : value)) as Vec3;
      const b = at.map((value, index) => (index === axis ? value + size : value)) as Vec3;
      this.segment(a, b, colour);
    }
  }

  private capsule(proxy: GunProxy, colour: Vec3, segments = RING_SEGMENTS): void {
    const axis = unit(proxy.tip.map((value, index) => value - proxy.butt[index]!) as Vec3);
    const side = unit(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const other = cross(axis, side);
    const ringPoint = (centre: Vec3, angle: number): Vec3 =>
      centre.map(
        (value, index) => value + proxy.radius * (Math.cos(angle) * side[index]! + Math.sin(angle) * other[index]!),
      ) as Vec3;
    for (const centre of [proxy.butt, proxy.muzzle, proxy.tip]) {
      for (let step = 0; step < segments; step++) {
        const a = (step / segments) * Math.PI * 2;
        const b = ((step + 1) / segments) * Math.PI * 2;
        this.segment(ringPoint(centre, a), ringPoint(centre, b), colour);
      }
    }
    for (let step = 0; step < 4; step++) {
      const angle = (step / 4) * Math.PI * 2;
      this.segment(ringPoint(proxy.butt, angle), ringPoint(proxy.tip, angle), colour);
    }
    this.segment(proxy.butt, proxy.tip, colour);
  }

  private flush(): void {
    const count = this.vertices.length;
    if (this.position.array.length < count) {
      this.position = new BufferAttribute(new Float32Array(count), 3);
      this.colour = new BufferAttribute(new Float32Array(count), 3);
      this.line.geometry.setAttribute('position', this.position);
      this.line.geometry.setAttribute('color', this.colour);
    }
    this.position.array.set(this.vertices);
    this.colour.array.set(this.colours);
    this.position.needsUpdate = true;
    this.colour.needsUpdate = true;
    this.line.geometry.setDrawRange(0, count / 3);
    this.line.visible = count > 0;
  }
}
