// Builds three.js objects from a validation report. This is the only place
// core types are converted to three.js types.

import {
  ArrowHelper,
  BoxGeometry,
  BufferGeometry,
  EdgesGeometry,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { MAIN_AXIS } from '../core/conventions.ts';
import { type Obb, worldBox } from '../core/geometry.ts';
import type { Issue } from '../core/issue.ts';
import type { Mat3, Transform, Vec3 } from '../core/math.ts';
import { applyDir, compose } from '../core/math.ts';
import { portFrame } from '../core/resolve.ts';
import type { Report } from '../core/validate.ts';

const FAMILY_COLORS: Record<string, number> = {
  receiver: 0x8d_93_9c,
  lower: 0x6f_75_7e,
  barrel: 0x5d_63_6b,
  'tube-magazine': 0x4d_53_5b,
  forend: 0x8a_6a_52,
  handguard: 0x74_80_5f,
  grip: 0x7d_60_4c,
  magazine: 0x56_62_76,
  stock: 0x8a_6a_52,
  sight: 0x3f_46_50,
};
const FAIL = 0xe5_53_4b;
const KEEP_OUT = 0x9d_7c_d8;
const NORMAL = 0xf0_a2_4a;
const UP = 0x4a_c1_f0;

export interface Layers {
  readonly solids: Group;
  readonly ports: Group;
  readonly keepOuts: Group;
  readonly axes: Group;
}

const v = (p: Vec3) => new Vector3(p[0], p[1], p[2]);

const matrixOf = (r: Mat3, t: Vec3) =>
  new Matrix4().set(r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2], 0, 0, 0, 1);

const placeBox = (obj: Object3D, obb: Obb) => {
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(matrixOf(obb.r, obb.center));
};

const boxGeometry = (obb: Obb) => new BoxGeometry(obb.half[0] * 2, obb.half[1] * 2, obb.half[2] * 2);

/** Which parts, ports and keep-outs the given issues point at. */
const highlights = (issues: readonly Issue[]) => ({
  parts: new Set(issues.flatMap((i) => i.parts)),
  ports: new Set(issues.flatMap((i) => i.ports ?? [])),
  keepOuts: new Set(issues.flatMap((i) => (i.keepOut ? [`${i.keepOut.part}.${i.keepOut.id}`] : []))),
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
export const buildLayers = (report: Report, focus: readonly Issue[]): Layers => {
  const { resolved } = report;
  const hl = highlights(focus);
  const layers: Layers = {
    solids: new Group(),
    ports: new Group(),
    keepOuts: new Group(),
    axes: new Group(),
  };

  for (const [part, t] of resolved.placed) {
    const def = resolved.defs.get(part)!;
    // e.g. "length M ← barrel.length, inner M"
    const params = Object.entries(resolved.params.get(part) ?? {})
      .map(([name, p]) => `${name} ${p.value}${p.from ? ` ← ${p.from}` : ''}`)
      .join(', ');
    const failing = hl.parts.has(part);

    for (const s of def.solids) {
      const obb = worldBox(t, s.box);
      const mesh = new Mesh(
        boxGeometry(obb),
        new MeshStandardMaterial({
          color: failing ? FAIL : (FAMILY_COLORS[def.family] ?? 0x88_88_88),
          flatShading: true,
          roughness: 0.85,
          metalness: 0.05,
        }),
      );
      placeBox(mesh, obb);
      mesh.userData = { label: `${part} (${def.family}) · solid ${s.id}${params ? ` · ${params}` : ''}` };
      const edges = new LineSegments(
        new EdgesGeometry(mesh.geometry),
        new LineBasicMaterial({ color: 0x00_00_00, transparent: true, opacity: 0.35 }),
      );
      mesh.add(edges);
      layers.solids.add(mesh);
    }

    for (const ko of def.keepOuts) {
      const obb = worldBox(t, ko.box);
      const hit = hl.keepOuts.has(`${part}.${ko.id}`);
      const color = hit ? FAIL : KEEP_OUT;
      const mesh = new Mesh(
        boxGeometry(obb),
        new MeshBasicMaterial({ color, transparent: true, opacity: hit ? 0.25 : 0.07, depthWrite: false }),
      );
      placeBox(mesh, obb);
      mesh.userData = { label: `${part} · keep-out ${ko.id} (${ko.kind})` };
      mesh.add(
        new LineSegments(
          new EdgesGeometry(mesh.geometry),
          new LineBasicMaterial({ color, transparent: true, opacity: hit ? 0.9 : 0.45 }),
        ),
      );
      layers.keepOuts.add(mesh);
    }

    for (const port of def.ports) {
      const qualified = `${part}.${port.id}`;
      const slots = port.slots?.count ?? 1;
      for (let slot = 0; slot < slots; slot++) {
        const frame: Transform = compose(t, portFrame(port, slot));
        const origin = v(frame.t);
        const scale = hl.ports.has(qualified) ? 1.6 : 1;
        const n = new ArrowHelper(v(applyDir(frame, [1, 0, 0])), origin, 2 * scale, NORMAL, 0.5, 0.3);
        const u = new ArrowHelper(v(applyDir(frame, [0, 1, 0])), origin, 1.2 * scale, UP, 0.35, 0.2);
        layers.ports.add(n, u);
      }
    }
  }

  // The main axis (for guns, the bore line).
  const axisStart = v(MAIN_AXIS.origin).addScaledVector(v(MAIN_AXIS.dir), -60);
  const axisEnd = v(MAIN_AXIS.origin).addScaledVector(v(MAIN_AXIS.dir), 90);
  layers.axes.add(
    new Line(
      new BufferGeometry().setFromPoints([axisStart, axisEnd]),
      new LineDashedMaterial({ color: 0xcf_d3_d9, dashSize: 1, gapSize: 0.6, transparent: true, opacity: 0.6 }),
    ).computeLineDistances(),
  );
  return layers;
};

export const disposeGroup = (group: Object3D) => {
  group.traverse((obj) => {
    const o = obj as Mesh;
    o.geometry?.dispose();
    const m = o.material;
    if (Array.isArray(m)) {
      for (const x of m) {
        x.dispose();
      }
    } else {
      m?.dispose();
    }
  });
};
