// A pure .glb (binary glTF 2.0) writer for placed assemblies (PROJECT.md 3.4). No three.js, no gun data:
// anchors and the palette come in as arguments, meshes come from `meshForSolid`.
//
// Layout of the file:
//   scene -> root node (named by the asset id)
//     -> one node per part, named `<part id>:<registry key>`, placed by its resolved transform, carrying one
//        mesh with one primitive per drawn solid (the solids the viewer draws: `displaySolids ?? solids`)
//        -> one empty child node per port, named `<part>.<port>`, with the port metadata in glTF `extras`
// Vertices are in the part's local frame times the domain's `units.metresPerUnit`; the node transform supplies the placement.

import { resolveAppearance } from './appearance.ts';
import type {
  DeadvoxModelEntry,
  DeadvoxModelFile,
  ExportGlb,
  ExportPortMetadata,
  GlbExportError,
  GlbExportResult,
  Palette,
  PartPortId,
  SrgbColor,
} from './design.ts';
import { type DisplayItem, displayItems } from './display.ts';
import { gripTurn, toFileAxes } from './exportFrame.ts';
import { applyDir, applyPoint, cross, fromColumns, type Mat3, type Transform, type Vec3 } from './math.ts';
import { displayBevel, meshForSolid, meshForSolidGroup } from './mesh.ts';
import type { PartDef, PortDef } from './schema.ts';

const ASSET_FILE = /^assets\/models\/[a-z0-9_-]+\.glb$/;
/** glTF node name of a part: its id and its registry key (`PartInstance.family`), e.g. `barrel:barrel`. */
export const partNodeName = (id: string, family: string): string => `${id}:${family}`;

/** The standard sRGB electro-optical transfer: one normalized channel to linear light. */
export const srgbToLinear = (c: number): number => (c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const validColor = (c: SrgbColor): boolean => c.length === 3 && c.every((x) => Number.isFinite(x) && x >= 0 && x <= 1);

/** The key of the first palette entry with a bad channel, named like the palette constructor names them. */
const badPaletteKey = (palette: Palette): string | undefined => {
  const entries: [string, SrgbColor][] = [
    ...Object.entries(palette.familyColors).map(([k, c]): [string, SrgbColor] => [`family ${k}`, c]),
    ...Object.entries(palette.specialColors).map(([k, c]): [string, SrgbColor] => [`special ${k}`, c]),
    ...Object.entries(palette.materials ?? {}).map(([k, c]): [string, SrgbColor] => [`material ${k}`, c]),
    ...Object.entries(palette.roleShades ?? {}).map(([k, c]): [string, SrgbColor] => [`shade ${k}`, c]),
    ['fallback', palette.fallbackColor],
  ];
  return entries.find(([, c]) => !validColor(c))?.[0];
};

const hex = (c: SrgbColor): string =>
  `#${c
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** glTF quaternion [x, y, z, w] of a proper rotation matrix. */
const quaternion = (m: Mat3): [number, number, number, number] => {
  const trace = m[0] + m[4] + m[8];
  let q: [number, number, number, number];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, s / 4];
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    q = [s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    q = [(m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4, (m[3] - m[1]) / s];
  }
  const l = Math.hypot(...q);
  const sign = q[3] < 0 ? -1 : 1;
  return q.map((x) => (x * sign) / l + 0) as [number, number, number, number];
};

const round6 = (x: number): number => {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

const toMetres = (v: Vec3, metresPerUnit: number): Vec3 => [
  v[0] * metresPerUnit,
  v[1] * metresPerUnit,
  v[2] * metresPerUnit,
];
const modelPoint = (v: Vec3, metresPerUnit: number): Vec3 => {
  const p = toMetres(toFileAxes(v), metresPerUnit);
  return [round6(p[0]), round6(p[1]), round6(p[2])];
};

const isIdentity = (m: Mat3): boolean => m.every((x, i) => Math.abs(x - (i % 4 === 0 ? 1 : 0)) < 1e-12);

// ---- binary buffer assembly ----

const ARRAY_BUFFER = 34_962;
const ELEMENT_ARRAY_BUFFER = 34_963;
const FLOAT = 5126;
const UNSIGNED_INT = 5125;

class BinaryBuffer {
  readonly views: { buffer: 0; byteOffset: number; byteLength: number; target: number }[] = [];
  readonly accessors: Record<string, unknown>[] = [];
  private readonly chunks: Uint8Array[] = [];
  private size = 0;

  /** Appends `data` (whose byte length is a multiple of 4) as a buffer view and returns its accessor index. */
  add(data: Float32Array | Uint32Array, accessor: Record<string, unknown>, target: number): number {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.views.push({ buffer: 0, byteOffset: this.size, byteLength: bytes.byteLength, target });
    this.chunks.push(bytes);
    this.size += bytes.byteLength;
    this.accessors.push({ bufferView: this.views.length - 1, ...accessor });
    return this.accessors.length - 1;
  }

  get byteLength(): number {
    return this.size;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, at);
      at += chunk.byteLength;
    }
    return out;
  }
}

const bounds = (positions: Float32Array): { min: number[]; max: number[] } => {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  }
  return { min, max };
};

const pad4 = (bytes: Uint8Array, fill: number): Uint8Array => {
  const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4).fill(fill);
  padded.set(bytes);
  return padded;
};

const glbFile = (json: unknown, bin: Uint8Array): Uint8Array => {
  const jsonBytes = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binBytes = pad4(bin, 0);
  const total = 12 + 8 + jsonBytes.byteLength + (binBytes.byteLength > 0 ? 8 + binBytes.byteLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46_54_6c_67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, 0x4e_4f_53_4a, true); // 'JSON'
  out.set(jsonBytes, 20);
  if (binBytes.byteLength > 0) {
    const at = 20 + jsonBytes.byteLength;
    view.setUint32(at, binBytes.byteLength, true);
    view.setUint32(at + 4, 0x00_4e_49_42, true); // 'BIN\0'
    out.set(binBytes, at + 8);
  }
  return out;
};

// ---- validation ----

const validId = (s: string): boolean => s.length > 0 && !s.includes('.');

const portFrameMatrix = (port: PortDef): Mat3 => fromColumns(port.normal, port.up, cross(port.normal, port.up));

const portMetadata = (partId: string, port: PortDef, placed: Transform): ExportPortMetadata => ({
  id: `${partId}.${port.id}` as PartPortId,
  mount: port.mount,
  gender: port.gender,
  ...(port.size === undefined ? {} : { size: port.size }),
  frame: {
    position: applyPoint(placed, port.pos),
    normal: applyDir(placed, port.normal),
    up: applyDir(placed, port.up),
  },
  ...(port.slots ? { rail: { count: port.slots.count, pitch: port.slots.pitch } } : {}),
});

type Json = Record<string, unknown>;

/** Everything the writer needs from one part, once it has passed validation. */
interface PartExport {
  readonly id: string;
  readonly family: string;
  readonly def: PartDef;
  readonly placed: Transform;
}

const sameAppearance = (a: ReturnType<typeof resolveAppearance>, b: ReturnType<typeof resolveAppearance>): boolean =>
  a.material === b.material && a.slot === b.slot && a.color.every((channel, index) => channel === b.color[index]);

/** Keep g27's finish boundary when using the shared g24 display groups. */
const splitMixedAppearance = (
  items: DisplayItem[],
  appearanceFor: (solid: DisplayItem['solids'][number]) => ReturnType<typeof resolveAppearance>,
): DisplayItem[] =>
  items.flatMap((item) => {
    if (!item.merged) {
      return [item];
    }
    const first = appearanceFor(item.solids[0]!);
    return item.solids.slice(1).every((solid) => sameAppearance(first, appearanceFor(solid)))
      ? [item]
      : item.solids.map((solid) => ({ id: solid.id, solids: [solid], merged: false }));
  });
const fail = (error: GlbExportError): GlbExportResult => ({ ok: false, error });

/** Checks the input in the order the frozen error variants are listed; the first problem wins. */
const refusal = (input: Parameters<ExportGlb>[0]): GlbExportError | undefined => {
  const { resolved, palette, asset } = input;
  if (resolved.issues.length > 0) {
    return { code: 'structure-issues', issues: resolved.issues };
  }
  const unplaced = Object.keys(resolved.assembly.parts)
    .filter((id) => !resolved.placed.has(id))
    .sort();
  if (unplaced.length > 0) {
    return { code: 'unplaced-parts', partIds: unplaced };
  }
  for (const id of Object.keys(resolved.assembly.parts).sort()) {
    const bad = validId(id) ? resolved.defs.get(id)?.ports.find((p) => !validId(p.id))?.id : id;
    if (bad !== undefined) {
      return { code: 'invalid-port-id', id: validId(id) ? `${id}.${bad}` : id };
    }
  }
  const badKey = badPaletteKey(palette);
  if (badKey !== undefined) {
    return { code: 'invalid-palette-color', key: badKey };
  }
  if (!ASSET_FILE.test(asset.file)) {
    return { code: 'invalid-asset-file', file: asset.file };
  }
  return undefined;
};

/**
 * Writes a resolved assembly as a `.glb` plus the matching deadvox model entry. Refuses (as an error value,
 * never an exception) an assembly with structure issues or unplaced parts, ids that can't form a stable
 * port id, a palette colour outside sRGB [0,1], and an asset file outside `assets/models/<name>.glb`.
 */
export const exportGlb: ExportGlb = (input) => {
  const error = refusal(input);
  if (error) {
    return fail(error);
  }
  const { resolved, anchors, palette, asset } = input;
  const { metresPerUnit } = resolved.domain.units;

  const parts: PartExport[] = Object.keys(resolved.assembly.parts)
    .sort()
    .flatMap((id) => {
      const def = resolved.defs.get(id);
      const placed = resolved.placed.get(id);
      return def && placed ? [{ id, family: resolved.assembly.parts[id]!.family, def, placed }] : [];
    });

  const bin = new BinaryBuffer();
  const materials: Json[] = [];
  const materialIndex = new Map<string, number>();
  const materialFor = (srgb: SrgbColor): number => {
    const linear = srgb.map(srgbToLinear);
    const key = linear.join(',');
    let index = materialIndex.get(key);
    if (index === undefined) {
      index = materials.length;
      materialIndex.set(key, index);
      materials.push({
        name: hex(srgb),
        pbrMetallicRoughness: { baseColorFactor: [...linear, 1], metallicFactor: 0, roughnessFactor: 0.85 },
      });
    }
    return index;
  };

  const meshes: Json[] = [];
  const appearanceFinish = input.finish ?? input.appearance?.finish;
  const appearanceContext = {
    ...input.appearance,
    ...(appearanceFinish === undefined ? {} : { finish: appearanceFinish }),
  };
  const nodes: Json[] = [{ name: asset.id, children: [] as number[] }];
  const rootChildren = (nodes[0] as { children: number[] }).children;
  const appearanceFor = (part: PartExport, solid: DisplayItem['solids'][number]) =>
    resolveAppearance(palette, part.def.family, solid.id, {
      context: appearanceContext,
      overrides: {
        ...(part.def.material === undefined ? {} : { partMaterial: part.def.material }),
        ...(part.def.slot === undefined ? {} : { partSlot: part.def.slot }),
        ...(solid.material === undefined ? {} : { solidMaterial: solid.material }),
        ...(solid.slot === undefined ? {} : { solidSlot: solid.slot }),
      },
    });
  const primitiveFor = (part: PartExport, item: DisplayItem): Json | undefined => {
    const solid = item.solids[0]!;
    const mesh = item.merged
      ? meshForSolidGroup(item.solids)
      : meshForSolid(solid, displayBevel(solid, resolved.domain.units), input.revolveFacets);
    if (mesh.triangleCount === 0 || mesh.indices.length === 0) {
      return undefined;
    }
    const positions = mesh.positions.map((x) => x * metresPerUnit);
    const { min, max } = bounds(positions);
    const position = bin.add(
      positions,
      { componentType: FLOAT, count: positions.length / 3, type: 'VEC3', min, max },
      ARRAY_BUFFER,
    );
    const normal = bin.add(
      mesh.normals,
      { componentType: FLOAT, count: mesh.normals.length / 3, type: 'VEC3' },
      ARRAY_BUFFER,
    );
    const indices = bin.add(
      mesh.indices,
      { componentType: UNSIGNED_INT, count: mesh.indices.length, type: 'SCALAR' },
      ELEMENT_ARRAY_BUFFER,
    );
    const appearance = appearanceFor(part, solid);
    return {
      attributes: { POSITION: position, NORMAL: normal },
      indices,
      material: materialFor(appearance.color),
      mode: 4,
      extras: {
        ...(item.merged ? { mergeGroup: item.id, solids: item.solids.map(({ id }) => id) } : { solid: solid.id }),
        ...(appearance.material === undefined ? {} : { material: appearance.material }),
        ...(appearance.slot === undefined ? {} : { slot: appearance.slot }),
      },
    };
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: existing glTF node construction; appearance metadata is conditional by contract.
  const addPart = (part: PartExport): void => {
    const drawn = part.def.displaySolids ?? part.def.solids;
    const primitives = splitMixedAppearance(displayItems(drawn), (solid) => appearanceFor(part, solid)).flatMap(
      (item) => {
        const primitive = primitiveFor(part, item);
        return primitive ? [primitive] : [];
      },
    );
    const name = partNodeName(part.id, part.family);
    const node: Json = { name };
    const rotation = quaternion(part.placed.r);
    if (!isIdentity(part.placed.r)) {
      node.rotation = rotation;
    }
    node.translation = toMetres(part.placed.t, metresPerUnit);
    if (primitives.length > 0) {
      node.mesh = meshes.length;
      meshes.push({ name, primitives });
    }
    const appearance = resolveAppearance(palette, part.def.family, '', {
      context: appearanceContext,
      overrides: {
        ...(part.def.material === undefined ? {} : { partMaterial: part.def.material }),
        ...(part.def.slot === undefined ? {} : { partSlot: part.def.slot }),
      },
    });
    node.extras = {
      part: part.id,
      family: part.family,
      role: part.def.family,
      ...(appearance.material === undefined ? {} : { material: appearance.material }),
      ...(appearance.slot === undefined ? {} : { slot: appearance.slot }),
      solids: drawn.map((s) => s.id),
      ...(part.def.motion ? { motion: part.def.motion } : {}),
    };

    const children: number[] = [];
    const nodeIndex = nodes.length;
    nodes.push(node);
    for (const port of part.def.ports) {
      const portNode: Json = {
        name: `${part.id}.${port.id}`,
        translation: toMetres(port.pos, metresPerUnit),
        extras: { port: portMetadata(part.id, port, part.placed) },
      };
      const frame = portFrameMatrix(port);
      if (!isIdentity(frame)) {
        portNode.rotation = quaternion(frame);
      }
      children.push(nodes.length);
      nodes.push(portNode);
    }
    if (children.length > 0) {
      node.children = children;
    }
    rootChildren.push(nodeIndex);
  };
  for (const part of parts) {
    addPart(part);
  }

  (nodes[0] as Json).extras = {
    gungen: {
      assembly: resolved.assembly.name,
      unit: 'u',
      metresPerUnit,
      portFrameUnit: 'u',
      materialCount: materials.length,
    },
  };

  const json: Json = {
    asset: { version: '2.0', generator: 'skelly gungen glb export' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    ...(meshes.length > 0 ? { meshes, materials } : {}),
    ...(bin.byteLength > 0
      ? {
          accessors: bin.accessors,
          bufferViews: bin.views,
          buffers: [{ byteLength: bin.byteLength }],
        }
      : {}),
  };

  const others = Object.entries(anchors.others).map(([name, frame]): [string, Vec3] => [
    name,
    modelPoint(frame.position, metresPerUnit),
  ]);
  const modelEntry: DeadvoxModelEntry = {
    id: asset.id,
    file: asset.file as DeadvoxModelFile,
    grip: { at: modelPoint(anchors.hold.position, metresPerUnit), turn: gripTurn() },
    ...(others.length > 0 ? { anchors: Object.fromEntries(others) } : {}),
  };
  return { ok: true, glb: glbFile(json, bin.bytes()), modelEntry };
};
