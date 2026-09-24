// Builds three.js objects from a validation report. This is the only place
// core types are converted to three.js types.

import * as THREE from 'three';
import { MAIN_AXIS } from '../core/conventions.ts';
import { type OBB, worldBox } from '../core/geometry.ts';
import type { Issue } from '../core/issue.ts';
import type { Mat3, Transform, Vec3 } from '../core/math.ts';
import { applyDir, compose } from '../core/math.ts';
import { portFrame } from '../core/resolve.ts';
import type { Report } from '../core/validate.ts';

const FAMILY_COLORS: Record<string, number> = {
  receiver: 0x8d939c,
  barrel: 0x5d636b,
  handguard: 0x74805f,
  grip: 0x7d604c,
  magazine: 0x566276,
  stock: 0x8a6a52,
  sight: 0x3f4650,
};
const FAIL = 0xe5534b;
const KEEP_OUT = 0x9d7cd8;
const NORMAL = 0xf0a24a;
const UP = 0x4ac1f0;

export interface Layers {
  readonly solids: THREE.Group;
  readonly ports: THREE.Group;
  readonly keepOuts: THREE.Group;
  readonly axes: THREE.Group;
}

const v = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

const matrixOf = (r: Mat3, t: Vec3) =>
  new THREE.Matrix4().set(r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2], 0, 0, 0, 1);

const placeBox = (obj: THREE.Object3D, obb: OBB) => {
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(matrixOf(obb.r, obb.center));
};

const boxGeometry = (obb: OBB) => new THREE.BoxGeometry(obb.half[0] * 2, obb.half[1] * 2, obb.half[2] * 2);

/** Which parts, ports and keep-outs the given issues point at. */
const highlights = (issues: readonly Issue[]) => ({
  parts: new Set(issues.flatMap((i) => i.parts)),
  ports: new Set(issues.flatMap((i) => i.ports ?? [])),
  keepOuts: new Set(issues.flatMap((i) => (i.keepOut ? [`${i.keepOut.part}.${i.keepOut.id}`] : []))),
});

export const buildLayers = (report: Report, focus: readonly Issue[]): Layers => {
  const { resolved } = report;
  const hl = highlights(focus);
  const layers: Layers = {
    solids: new THREE.Group(),
    ports: new THREE.Group(),
    keepOuts: new THREE.Group(),
    axes: new THREE.Group(),
  };

  for (const [part, t] of resolved.placed) {
    const def = resolved.defs.get(part)!;
    const failing = hl.parts.has(part);

    for (const s of def.solids) {
      const obb = worldBox(t, s.box);
      const mesh = new THREE.Mesh(
        boxGeometry(obb),
        new THREE.MeshStandardMaterial({
          color: failing ? FAIL : (FAMILY_COLORS[def.family] ?? 0x888888),
          flatShading: true,
          roughness: 0.85,
          metalness: 0.05,
        }),
      );
      placeBox(mesh, obb);
      mesh.userData = { label: `${part} (${def.family}) · solid ${s.id}` };
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
      );
      mesh.add(edges);
      layers.solids.add(mesh);
    }

    for (const ko of def.keepOuts) {
      const obb = worldBox(t, ko.box);
      const hit = hl.keepOuts.has(`${part}.${ko.id}`);
      const color = hit ? FAIL : KEEP_OUT;
      const mesh = new THREE.Mesh(
        boxGeometry(obb),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: hit ? 0.25 : 0.07, depthWrite: false }),
      );
      placeBox(mesh, obb);
      mesh.userData = { label: `${part} · keep-out ${ko.id} (${ko.kind})` };
      mesh.add(
        new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: hit ? 0.9 : 0.45 }),
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
        const n = new THREE.ArrowHelper(v(applyDir(frame, [1, 0, 0])), origin, 2 * scale, NORMAL, 0.5, 0.3);
        const u = new THREE.ArrowHelper(v(applyDir(frame, [0, 1, 0])), origin, 1.2 * scale, UP, 0.35, 0.2);
        layers.ports.add(n, u);
      }
    }
  }

  // The main axis (for guns, the bore line).
  const axisStart = v(MAIN_AXIS.origin).addScaledVector(v(MAIN_AXIS.dir), -60);
  const axisEnd = v(MAIN_AXIS.origin).addScaledVector(v(MAIN_AXIS.dir), 90);
  layers.axes.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([axisStart, axisEnd]),
      new THREE.LineDashedMaterial({ color: 0xcfd3d9, dashSize: 1, gapSize: 0.6, transparent: true, opacity: 0.6 }),
    ).computeLineDistances(),
  );
  return layers;
};

export const disposeGroup = (group: THREE.Object3D) => {
  group.traverse((obj) => {
    const o = obj as THREE.Mesh;
    o.geometry?.dispose();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose());
    else m?.dispose();
  });
};
