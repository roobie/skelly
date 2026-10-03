// Builds three.js objects from a validation report. This is the only place
// core types are converted to three.js types.

import {
  ArrowHelper,
  BoxGeometry,
  BufferAttribute,
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
import { resolveAppearance } from '../core/appearance.ts';
import { MAIN_AXIS } from '../core/conventions.ts';
import type { AppearanceContext } from '../core/design.ts';
import { type DisplayItem, displayItems } from '../core/display.ts';
import { type Obb, worldBox } from '../core/geometry.ts';
import type { Issue } from '../core/issue.ts';
import type { Mat3, Transform, Vec3 } from '../core/math.ts';
import { applyDir, compose } from '../core/math.ts';
import { displayBevel, meshForSolid, meshForSolidGroup } from '../core/mesh.ts';
import { portFrame } from '../core/resolve.ts';
import type { Solid } from '../core/schema.ts';
import type { Report } from '../core/validate.ts';
import { GUN_PALETTE, solidColor, srgbToHex } from '../gun/palette.ts';

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

/** Converts a core TriangleMesh (positions/normals/indices only) to a three.js BufferGeometry. */
const triangleGeometry = (mesh: ReturnType<typeof meshForSolid>) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return geometry;
};

const meshGeometry = (solid: Solid, bevel?: number, revolveFacets?: number) =>
  triangleGeometry(meshForSolid(solid, bevel, revolveFacets));

/** Keep-outs stay plain boxes/extrusions; only rendered solids are beveled. */
const solidGeometry = (solid: Solid) => {
  if (solid.kind === 'box') {
    return new BoxGeometry(solid.box.half[0] * 2, solid.box.half[1] * 2, solid.box.half[2] * 2);
  }
  return meshGeometry(solid, 0);
};

const sameAppearance = (a: ReturnType<typeof resolveAppearance>, b: ReturnType<typeof resolveAppearance>): boolean =>
  a.material === b.material && a.slot === b.slot && a.color.every((channel, index) => channel === b.color[index]);

/** Finish merges compatible surfaces; diagnostic mode preserves authored component roles across convex cells. */
const renderedItems = ({
  solids,
  family,
  colorMode,
  appearanceFor,
}: {
  solids: readonly Solid[];
  family: string;
  colorMode: 'finish' | 'role';
  appearanceFor: (solid: Solid) => ReturnType<typeof resolveAppearance>;
}): DisplayItem[] => {
  const roleColor = (solid: Solid) =>
    srgbToHex(solidColor(GUN_PALETTE, family, solid.display?.role ?? solid.id, solid.material));
  const compatible = (members: readonly Solid[]) =>
    members
      .slice(1)
      .every(
        (solid) =>
          sameAppearance(appearanceFor(members[0]!), appearanceFor(solid)) &&
          (colorMode === 'finish' || roleColor(members[0]!) === roleColor(solid)),
      );
  const singles = (members: readonly Solid[]): DisplayItem[] =>
    members.map((solid) => ({ id: solid.id, solids: [solid], merged: false }));
  return displayItems(solids).flatMap((item) => {
    if (!item.merged || compatible(item.solids)) {
      return [item];
    }
    if (colorMode === 'finish') {
      return singles(item.solids);
    }
    const groups = new Map<string, Solid[]>();
    for (const solid of item.solids) {
      const role = solid.display?.role ?? solid.id;
      groups.set(role, [...(groups.get(role) ?? []), solid]);
    }
    return [...groups].flatMap(([id, members]) =>
      compatible(members) ? [{ id, solids: members, merged: members.length > 1 }] : singles(members),
    );
  });
};

/** Which parts, ports and keep-outs the given issues point at. */
const highlights = (issues: readonly Issue[]) => ({
  parts: new Set(issues.flatMap((i) => i.parts)),
  ports: new Set(issues.flatMap((i) => i.ports ?? [])),
  keepOuts: new Set(issues.flatMap((i) => (i.keepOut ? [`${i.keepOut.part}.${i.keepOut.id}`] : []))),
});

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: predates the complexity limit; split it up when next changed
// biome-ignore lint/complexity/useMaxParams: the existing positional signature plus the revolve level of detail; callers pass the first two or four.
export function buildLayers(
  report: Report,
  focus: readonly Issue[],
  colorMode: 'finish' | 'role' = 'finish',
  appearanceContext: AppearanceContext = {},
  revolveFacets?: number,
  partOffsets: ReadonlyMap<string, Vec3> = new Map(),
): Layers {
  const { resolved } = report;
  const hl = highlights(focus);
  const layers: Layers = {
    solids: new Group(),
    ports: new Group(),
    keepOuts: new Group(),
    axes: new Group(),
  };

  for (const [part, placed] of resolved.placed) {
    const offset = partOffsets.get(part);
    const t: Transform = offset
      ? { r: placed.r, t: [placed.t[0] + offset[0], placed.t[1] + offset[1], placed.t[2] + offset[2]] }
      : placed;
    const def = resolved.defs.get(part)!;
    // e.g. "length M ← barrel.length, inner M"
    const params = Object.entries(resolved.params.get(part) ?? {})
      .map(([name, p]) => `${name} ${p.value}${p.from ? ` ← ${p.from}` : ''}`)
      .join(', ');
    const failing = hl.parts.has(part);

    const drawn = def.displaySolids ?? def.solids;
    const appearanceFor = (solid: Solid) =>
      resolveAppearance(GUN_PALETTE, def.family, solid.id, {
        context: appearanceContext,
        overrides: {
          ...(def.material === undefined ? {} : { partMaterial: def.material }),
          ...(def.slot === undefined ? {} : { partSlot: def.slot }),
          ...(solid.material === undefined ? {} : { solidMaterial: solid.material }),
          ...(solid.slot === undefined ? {} : { solidSlot: solid.slot }),
        },
      });
    const rendered = renderedItems({ solids: drawn, family: def.family, colorMode, appearanceFor });
    for (const item of rendered) {
      const s = item.solids[0]!;
      const appearance = appearanceFor(s);
      const color = failing
        ? FAIL
        : srgbToHex(
            colorMode === 'role'
              ? solidColor(GUN_PALETTE, def.family, s.display?.role ?? s.id, s.material)
              : appearance.color,
          );
      const geometry = item.merged
        ? triangleGeometry(meshForSolidGroup(item.solids))
        : meshGeometry(s, displayBevel(s, resolved.domain.units), revolveFacets);
      // A revolved solid is smooth-shaded from its own normals; everything else is flat-shaded.
      const smooth = s.kind === 'revolved';
      const mesh = new Mesh(
        geometry,
        new MeshStandardMaterial({
          color,
          flatShading: !smooth,
          roughness: 0.85,
          metalness: 0.05,
        }),
      );
      // The solid's own box.center/profile is already baked into its mesh's positions.
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrixOf(t.r, t.t));
      mesh.userData = { part, label: `${part} (${def.family}) · solid ${item.id}${params ? ` · ${params}` : ''}` };
      // Edges would trace every facet of a smooth revolved mesh, so it is outlined only on request.
      if (item.merged || (smooth ? s.display?.outline === true : s.display?.outline !== false)) {
        const edges = new LineSegments(
          new EdgesGeometry(mesh.geometry, s.display?.outlineAngleDeg),
          new LineBasicMaterial({ color: 0x00_00_00, transparent: true, opacity: 0.35 }),
        );
        mesh.add(edges);
      }
      layers.solids.add(mesh);
    }

    for (const ko of def.keepOuts) {
      const polygon = ko.profile && ko.z;
      const obb = polygon ? undefined : worldBox(t, ko.box);
      const shape: Solid = polygon
        ? {
            id: ko.id,
            kind: 'extruded-polygon',
            profile: ko.profile!,
            z: ko.z!,
            ...(ko.axis ? { axis: ko.axis } : {}),
          }
        : { id: ko.id, kind: 'box', box: ko.box };
      const hit = hl.keepOuts.has(`${part}.${ko.id}`);
      const color = hit ? FAIL : KEEP_OUT;
      const mesh = new Mesh(
        solidGeometry(shape),
        new MeshBasicMaterial({ color, transparent: true, opacity: hit ? 0.25 : 0.07, depthWrite: false }),
      );
      if (obb) {
        placeBox(mesh, obb);
      } else {
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(matrixOf(t.r, t.t));
      }
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
}

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
