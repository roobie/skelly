import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { SHOT_TRACE_RANGE_BLOCKS } from '../core/crosshairTarget.ts';
import type { Vec3 } from '../core/coords.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { FirearmTrajectory } from '../game/firearmHandling.ts';
import { type ShotTrace, traceShot } from './shotTrace.ts';

export const IMPACT_MARK_CAP = 96;
const DUST_SECONDS = 0.55;
export const PING_SECONDS = 1.4;
const LASER_SECONDS = 0.35;
const FACE_NORMAL = new Vector3(0, 0, 1);
const ZERO_POINT = new Vector3();
const ZERO_ORIENTATION = new Quaternion();

interface InstanceTransform {
  point: Vector3;
  orientation: Quaternion;
  scale: number;
  offset?: number;
  normal?: Vector3;
}

interface Mark {
  readonly surfacePoint: Vector3;
  readonly surfaceNormal: Vector3;
  readonly orientation: Quaternion;
  active: boolean;
  dustAge: number;
  pingAge: number;
}

export class ImpactEffects {
  readonly group = new Group();
  readonly holes: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  readonly dust: InstancedMesh<SphereGeometry, MeshBasicMaterial>;
  readonly pings: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  readonly laser: LineSegments;
  private readonly blockSize: number;
  private readonly solidAt: SolidAt;
  private readonly isTargetCell: (block: Vec3) => boolean;
  private readonly marks: Mark[];
  private readonly dummy = new Object3D();
  private readonly color = new Color();
  private next = 0;
  private laserAge = LASER_SECONDS;

  constructor(blockSize: number, solidAt: SolidAt, isTargetCell: (block: Vec3) => boolean = () => false) {
    this.blockSize = blockSize;
    this.solidAt = solidAt;
    this.isTargetCell = isTargetCell;
    const holeGeometry = new CircleGeometry(blockSize * 0.075, 10);
    const pingGeometry = new CircleGeometry(blockSize * 0.16, 12);
    const dustGeometry = new SphereGeometry(blockSize * 0.045, 5, 4);
    this.holes = new InstancedMesh(
      holeGeometry,
      new MeshBasicMaterial({ color: 0x10_10_10, side: 2 }),
      IMPACT_MARK_CAP,
    );
    this.dust = new InstancedMesh(
      dustGeometry,
      new MeshBasicMaterial({ color: 0xb7_a9_8b, vertexColors: true, transparent: true, depthWrite: false }),
      IMPACT_MARK_CAP,
    );
    this.pings = new InstancedMesh(
      pingGeometry,
      new MeshBasicMaterial({ color: 0xff_ff_ff, vertexColors: true, transparent: true, depthWrite: false, side: 2 }),
      IMPACT_MARK_CAP,
    );
    for (const mesh of [this.holes, this.dust, this.pings]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.marks = Array.from({ length: IMPACT_MARK_CAP }, () => ({
      surfacePoint: new Vector3(),
      surfaceNormal: new Vector3(),
      orientation: new Quaternion(),
      active: false,
      dustAge: DUST_SECONDS,
      pingAge: PING_SECONDS,
    }));
    for (let i = 0; i < IMPACT_MARK_CAP; i++) {
      this.write(this.holes, i, { point: ZERO_POINT, orientation: ZERO_ORIENTATION, scale: 0 });
      this.write(this.dust, i, { point: ZERO_POINT, orientation: ZERO_ORIENTATION, scale: 0 });
      this.write(this.pings, i, { point: ZERO_POINT, orientation: ZERO_ORIENTATION, scale: 0 });
      this.dust.setColorAt(i, this.color.setRGB(0, 0, 0));
      this.pings.setColorAt(i, this.color.setRGB(0, 0, 0));
    }
    this.dust.instanceColor!.setUsage(DynamicDrawUsage);
    this.pings.instanceColor!.setUsage(DynamicDrawUsage);
    const laserGeometry = new BufferGeometry();
    laserGeometry.setAttribute('position', new BufferAttribute(new Float32Array(64 * 6), 3));
    this.laser = new LineSegments(laserGeometry, new LineBasicMaterial({ color: 0xff_00_ff }));
    // Rewritten endpoints make a cached bounding sphere stale; this bounded debug line needs no frustum culling.
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    this.group.add(this.laser);
  }

  get activeMarks(): number {
    return this.marks.reduce((total, mark) => total + Number(mark.active), 0);
  }

  /** Tracing, holes, pings and the laser share one resolved segment per pellet/round. */
  fire(trajectory: FirearmTrajectory, debugLaser: boolean): void {
    const traces = traceShot(trajectory.origin, trajectory.directions, SHOT_TRACE_RANGE_BLOCKS, this.solidAt);
    for (const trace of traces) {
      if (!trace.hit) {
        continue;
      }
      const slot = this.mark(trace);
      if (this.isTargetCell(trace.hit.block)) {
        this.ping(slot);
      }
    }
    this.laserAge = 0;
    this.writeLaser(traces, debugLaser);
  }

  update(dt: number, debugLaser: boolean): void {
    const step = Math.max(0, dt);
    this.laserAge += step;
    this.laser.visible = debugLaser && this.laserAge < LASER_SECONDS;
    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i]!;
      if (mark.dustAge < DUST_SECONDS) {
        mark.dustAge += step;
        const fraction = Math.max(0, 1 - mark.dustAge / DUST_SECONDS);
        this.write(this.dust, i, {
          point: mark.surfacePoint,
          orientation: mark.orientation,
          scale: (1 + (1 - fraction) * 2) * fraction,
        });
        this.dust.setColorAt(i, this.color.setRGB(fraction * 0.55, fraction * 0.5, fraction * 0.4));
      }
      if (mark.pingAge < PING_SECONDS) {
        mark.pingAge += step;
        const fraction = Math.max(0, 1 - mark.pingAge / PING_SECONDS);
        this.write(this.pings, i, {
          point: mark.surfacePoint,
          orientation: mark.orientation,
          scale: (1 + (1 - fraction) * 0.8) * fraction,
        });
        this.pings.setColorAt(i, this.color.setRGB(fraction, fraction * 0.92, fraction * 0.15));
      }
    }
    this.dust.instanceMatrix.needsUpdate = true;
    this.dust.instanceColor!.needsUpdate = true;
    this.pings.instanceMatrix.needsUpdate = true;
    this.pings.instanceColor!.needsUpdate = true;
  }

  private mark(trace: ShotTrace): number {
    const slot = this.next;
    const mark = this.marks[slot]!;
    this.next = (this.next + 1) % this.marks.length;
    const [x, y, z] = trace.endpoint;
    mark.surfacePoint.set(x * this.blockSize, y * this.blockSize, z * this.blockSize);
    const hitNormal = trace.hit?.normal;
    if (hitNormal && (hitNormal[0] !== 0 || hitNormal[1] !== 0 || hitNormal[2] !== 0)) {
      mark.surfaceNormal.set(...hitNormal).normalize();
    } else {
      mark.surfaceNormal.set(-trace.direction[0], -trace.direction[1], -trace.direction[2]).normalize();
    }
    mark.orientation.setFromUnitVectors(FACE_NORMAL, mark.surfaceNormal);
    mark.active = true;
    this.write(this.holes, slot, {
      point: mark.surfacePoint,
      orientation: mark.orientation,
      scale: 1,
      offset: this.blockSize * 0.006,
      normal: mark.surfaceNormal,
    });
    this.write(this.dust, slot, {
      point: mark.surfacePoint,
      orientation: mark.orientation,
      scale: 1,
      offset: this.blockSize * 0.025,
      normal: mark.surfaceNormal,
    });
    this.dust.setColorAt(slot, this.color.setRGB(0.55, 0.5, 0.4));
    this.write(this.pings, slot, { point: mark.surfacePoint, orientation: mark.orientation, scale: 0 });
    mark.dustAge = 0;
    mark.pingAge = PING_SECONDS;
    this.holes.instanceMatrix.needsUpdate = true;
    this.dust.instanceMatrix.needsUpdate = true;
    this.dust.instanceColor!.needsUpdate = true;
    this.pings.instanceMatrix.needsUpdate = true;
    return slot;
  }

  private ping(slot: number): void {
    const mark = this.marks[slot]!;
    this.write(this.pings, slot, {
      point: mark.surfacePoint,
      orientation: mark.orientation,
      scale: 1,
      offset: this.blockSize * 0.02,
      normal: mark.surfaceNormal,
    });
    this.pings.setColorAt(slot, this.color.setRGB(1, 0.92, 0.15));
    mark.pingAge = 0;
    this.pings.instanceMatrix.needsUpdate = true;
    this.pings.instanceColor!.needsUpdate = true;
  }

  private write(mesh: InstancedMesh, slot: number, transform: InstanceTransform): void {
    this.dummy.position.copy(transform.point);
    if (transform.normal && transform.offset !== undefined && transform.offset !== 0) {
      this.dummy.position.addScaledVector(transform.normal, transform.offset);
    }
    this.dummy.quaternion.copy(transform.orientation);
    this.dummy.scale.setScalar(transform.scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(slot, this.dummy.matrix);
  }

  private writeLaser(traces: readonly ShotTrace[], enabled: boolean): void {
    const attribute = this.laser.geometry.getAttribute('position') as BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < 64; i++) {
      const trace = traces[i];
      const offset = i * 6;
      array[offset] = trace ? trace.origin[0] * this.blockSize : 0;
      array[offset + 1] = trace ? trace.origin[1] * this.blockSize : 0;
      array[offset + 2] = trace ? trace.origin[2] * this.blockSize : 0;
      array[offset + 3] = trace ? trace.endpoint[0] * this.blockSize : 0;
      array[offset + 4] = trace ? trace.endpoint[1] * this.blockSize : 0;
      array[offset + 5] = trace ? trace.endpoint[2] * this.blockSize : 0;
    }
    attribute.needsUpdate = true;
    this.laser.geometry.setDrawRange(0, Math.min(traces.length, 64) * 2);
    this.laser.visible = enabled && traces.length > 0;
  }

  dispose(): void {
    this.group.clear();
    this.laser.geometry.dispose();
    (this.laser.material as LineBasicMaterial).dispose();
    this.holes.dispose();
    this.dust.dispose();
    this.pings.dispose();
    this.holes.geometry.dispose();
    this.dust.geometry.dispose();
    this.pings.geometry.dispose();
    this.holes.material.dispose();
    this.dust.material.dispose();
    this.pings.material.dispose();
  }
}
