import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GlbAssetIdentity, Palette, SelectedAnchors } from '../src/core/design.ts';
import { eulerXyzDegrees, FILE_FROM_GUNGEN, gripTurn, METRES_PER_UNIT, toFileAxes } from '../src/core/exportFrame.ts';
import { exportGlb, partNodeName, srgbToLinear } from '../src/core/glb.ts';
import { applyPoint, type Mat3, mulMM, mulMV, rotX, rotY, rotZ, type Vec3 } from '../src/core/math.ts';
import { meshForSolid, meshForSolidGroup } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly } from '../src/core/schema.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { GUN_PALETTE, solidColor } from '../src/gun/palette.ts';
import { readGlb } from './glbReader.ts';
import { variant } from './helpers.ts';

const design = (name: string): Assembly => {
  const result = loadGunDesign(readFileSync(join(import.meta.dirname, '..', 'designs', `${name}.json`), 'utf8'));
  if (!result.ok) {
    throw new Error(`${name}: ${result.error.message}`);
  }
  return result.design.assembly;
};

const ASSET: GlbAssetIdentity = { id: 'rifle_test', file: 'assets/models/rifle_test.glb' };
const S = METRES_PER_UNIT;

const exported = (assembly: Assembly, asset: GlbAssetIdentity = ASSET) => {
  const result = exportGunGlb(assembly, asset);
  if (!result.ok) {
    throw new Error(`export failed: ${JSON.stringify(result.error)}`);
  }
  return { ...result, read: readGlb(result.glb), resolved: resolve(assembly, gunDomain) };
};

const near = (a: readonly number[], b: readonly number[], digits = 6): void => {
  // biome-ignore lint/suspicious/noMisplacedAssertion: a small comparison helper called from tests
  expect(a).toEqual(b.map((x) => expect.closeTo(x, digits)));
};

interface PortExtras {
  id: string;
  mount: string;
  gender: string;
  size?: string;
  rail?: unknown;
  frame: { position: number[]; normal: number[]; up: number[] };
}
const portExtras = (node: { extras?: Record<string, unknown> }): PortExtras => node.extras!.port as PortExtras;

/** Rotates by a glTF quaternion [x, y, z, w]. */
const rotateByQuaternion = (q: readonly number[], v: Vec3): Vec3 => {
  const [qx, qy, qz, qw] = q as [number, number, number, number];
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
};

describe('glb export: axes and units', () => {
  it('uses 1u = 11.5 mm', () => {
    expect(METRES_PER_UNIT).toBe(0.0115);
  });

  it('maps gungen forward and up onto deadvox held +x and +y with a zero turn', () => {
    expect(toFileAxes([1, 0, 0])).toEqual([1, 0, 0]);
    expect(toFileAxes([0, 1, 0])).toEqual([0, 1, 0]);
    expect(FILE_FROM_GUNGEN).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(gripTurn()).toEqual([0, 0, 0]);
  });

  it('derives the turn that undoes a file mapping, matching deadvox for a Z-up file', () => {
    // A Z-up file (deadvox's existing firearms): gungen up (+Y) is file +Z, gungen right (+Z) is file -Y.
    const zUp: Mat3 = [1, 0, 0, 0, 0, -1, 0, 1, 0];
    expect(gripTurn(zUp)).toEqual([-90, 0, 0]);
  });

  it('round-trips the Euler extraction in deadvox XYZ order', () => {
    const m = mulMM(mulMM(rotX(30), rotY(-40)), rotZ(70));
    near(eulerXyzDegrees(m), [30, -40, 70]);
    // Turning a Z-up file by the derived turn puts its up axis on +Y and its forward on +X.
    const turn = gripTurn([1, 0, 0, 0, 0, -1, 0, 1, 0]);
    const t = mulMM(mulMM(rotX(turn[0]), rotY(turn[1])), rotZ(turn[2]));
    near(mulMV(t, [0, 0, 1]), [0, 1, 0]);
    near(mulMV(t, [1, 0, 0]), [1, 0, 0]);
  });
});

describe('glb export: nodes', () => {
  const ar = exported(design('archetype-ar'));

  it('writes a valid glb 2.0 container with one scene', () => {
    expect(ar.read.json.asset.version).toBe('2.0');
    expect(ar.read.json.scenes).toHaveLength(1);
    expect(ar.read.json.nodes[ar.read.json.scenes[0]!.nodes[0]!]?.name).toBe(ASSET.id);
  });

  it('emits the BCG as its own node with linear travel extras and keeps port metadata children', () => {
    const node = ar.read.json.nodes.find((entry) => entry.extras?.part === 'bolt-carrier')!;
    expect(node.name).toBe(partNodeName('bolt-carrier', 'bolt-carrier'));
    expect(node.extras?.motion).toEqual({ kind: 'linear', axis: [1, 0, 0], rest: [0, 0, 0], rearmost: [6.5, 0, 0] });
    expect((node.children ?? []).some((index) => ar.read.json.nodes[index]!.name === 'bolt-carrier.mount')).toBe(true);
  });

  it('names one node per part by part id and registry-key family', () => {
    const { json } = ar.read;
    const names = json.nodes.map((n) => n.name);
    for (const [id, inst] of Object.entries(ar.resolved.assembly.parts)) {
      expect(names.filter((n) => n === partNodeName(id, inst.family))).toHaveLength(1);
    }
    expect(partNodeName('barrel', 'barrel')).toBe('barrel:barrel');
  });

  it('has one part node plus one child node per port, and no more', () => {
    const { json } = ar.read;
    const root = json.nodes[json.scenes[0]!.nodes[0]!]!;
    expect(root.children).toHaveLength(Object.keys(ar.resolved.assembly.parts).length);
    for (const child of root.children!) {
      const node = json.nodes[child]!;
      const id = node.extras?.part as string;
      const def = ar.resolved.defs.get(id)!;
      expect(node.children).toHaveLength(def.ports.length);
      expect(node.mesh).toBeDefined();
    }
    const total = 1 + json.nodes.length - 1;
    const expected = 1 + [...ar.resolved.defs.values()].reduce((sum, def) => sum + 1 + def.ports.length, 0);
    expect(total).toBe(expected);
  });

  it('places each part node at its resolved transform, in metres', () => {
    const { json } = ar.read;
    const root = json.nodes[json.scenes[0]!.nodes[0]!]!;
    for (const child of root.children!) {
      const node = json.nodes[child]!;
      const id = node.extras?.part as string;
      const placed = ar.resolved.placed.get(id)!;
      const probe: Vec3 = [1.5, -2.25, 0.75];
      const viaNode = rotateByQuaternion(node.rotation ?? [0, 0, 0, 1], [probe[0] * S, probe[1] * S, probe[2] * S]);
      const world = viaNode.map((x, i) => x + (node.translation?.[i] ?? 0));
      near(
        world,
        applyPoint(placed, probe).map((x) => x * S),
        7,
      );
    }
  });
});

describe('glb export: port metadata', () => {
  const ar = exported(design('archetype-ar'));
  const partNode = (id: string) => ar.read.json.nodes.find((n) => n.extras?.part === id)!;

  it('records a port in its child node extras with the stable id, mount, gender, size and mating frame', () => {
    const def = ar.resolved.defs.get('barrel')!;
    const port = def.ports.find((p) => p.id === 'muzzle')!;
    const child =
      ar.read.json.nodes[partNode('barrel').children!.find((c) => ar.read.json.nodes[c]!.name === 'barrel.muzzle')!]!;
    expect(child.mesh).toBeUndefined();
    const meta = child.extras?.port as Record<string, unknown>;
    expect(meta.id).toBe('barrel.muzzle');
    expect(meta.mount).toBe(port.mount);
    expect(meta.gender).toBe(port.gender);
    expect(meta.size).toBe(port.size);
    const t = ar.resolved.placed.get('barrel')!;
    const frame = meta.frame as { position: number[]; normal: number[]; up: number[] };
    near(frame.position, applyPoint(t, port.pos));
    near(frame.normal, mulMV(t.r, port.normal));
    near(frame.up, mulMV(t.r, port.up));
  });

  it('exports a slotted rail once per port, with one count/pitch record', () => {
    const railParts = [...ar.resolved.defs].filter(([, def]) => def.ports.some((p) => p.slots));
    expect(railParts.length).toBeGreaterThan(0);
    for (const [id, def] of railParts) {
      const rails = def.ports.filter((p) => p.slots);
      for (const rail of rails) {
        const nodes = ar.read.json.nodes.filter((n) => n.name === `${id}.${rail.id}`);
        expect(nodes).toHaveLength(1);
        expect(portExtras(nodes[0]!).rail).toEqual(rail.slots);
      }
    }
  });

  it('puts the mating frame of every port in the assembly space of the part', () => {
    for (const [id, def] of ar.resolved.defs) {
      const t = ar.resolved.placed.get(id)!;
      for (const port of def.ports) {
        const node = ar.read.json.nodes.find((n) => n.name === `${id}.${port.id}`)!;
        near(portExtras(node).frame.position, applyPoint(t, port.pos));
      }
    }
  });
});

describe('glb export: meshes', () => {
  const ar = exported(design('archetype-ar'));
  const { json } = ar.read;

  const drawn = (id: string) => {
    const def = ar.resolved.defs.get(id)!;
    return def.displaySolids ?? def.solids;
  };
  const displayItems = (id: string) => {
    const solids = drawn(id);
    const groups = new Map<string, typeof solids>();
    for (const solid of solids) {
      const group = solid.display?.mergeGroup;
      if (group) groups.set(group, [...(groups.get(group) ?? []), solid]);
    }
    return [
      ...solids.filter((solid) => !solid.display?.mergeGroup).map((solid) => ({ id: solid.id, solids: [solid], mesh: meshForSolid(solid) })),
      ...[...groups].map(([group, members]) => ({ id: group, solids: members, mesh: meshForSolidGroup(members) })),
    ];
  };

  it('draws normal solids individually and section shells as one merged primitive', () => {
    for (const id of Object.keys(ar.resolved.assembly.parts)) {
      const node = json.nodes.find((n) => n.extras?.part === id)!;
      const prims = json.meshes[node.mesh!]!.primitives;
      expect(prims.map((p) => {
        const extras = p.extras as Record<string, unknown> | undefined;
        return extras?.solid ?? extras?.mergeGroup;
      })).toEqual(displayItems(id).map(({ id: itemId }) => itemId));
    }
  });

  it('matches mesh.ts bounds times the metre scale for every solid', () => {
    for (const id of Object.keys(ar.resolved.assembly.parts)) {
      const node = json.nodes.find((n) => n.extras?.part === id)!;
      const prims = json.meshes[node.mesh!]!.primitives;
      displayItems(id).forEach((item, i) => {
        const mesh = item.mesh;
        const lo = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
        const hi = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
        for (let v = 0; v < mesh.positions.length; v += 3) {
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k]!, mesh.positions[v + k]! * S);
            hi[k] = Math.max(hi[k]!, mesh.positions[v + k]! * S);
          }
        }
        const acc = json.accessors[prims[i]!.attributes.POSITION]!;
        near(acc.min!, lo, 7);
        near(acc.max!, hi, 7);
        const positions = ar.read.floats(prims[i]!.attributes.POSITION);
        expect(positions.length).toBe(mesh.positions.length);
        near(
          Array.from(positions).slice(0, 30),
          Array.from(mesh.positions.slice(0, 30)).map((x) => x * S),
          7,
        );
        expect(json.accessors[prims[i]!.indices]!.count).toBe(mesh.indices.length);
      });
    }
  });

  it('writes unit-length normals, unscaled', () => {
    let checked = 0;
    for (const mesh of json.meshes) {
      for (const prim of mesh.primitives) {
        const normals = ar.read.floats(prim.attributes.NORMAL);
        for (let i = 0; i < normals.length; i += 3) {
          expect(Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!)).toBeCloseTo(1, 5);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('colours each solid with the palette converted from sRGB to linear', () => {
    for (const [id, inst] of Object.entries(ar.resolved.assembly.parts)) {
      const role = ar.resolved.defs.get(id)!.family;
      const node = json.nodes.find((n) => n.extras?.part === id)!;
      for (const prim of json.meshes[node.mesh!]!.primitives) {
        const extras = prim.extras as Record<string, unknown> | undefined;
        const groupedSolids = extras?.solids as string[] | undefined;
        const solidId = (extras?.solid as string | undefined) ?? groupedSolids?.[0]!;
        const srgb = solidColor(GUN_PALETTE, role, solidId);
        const factor = json.materials[prim.material]!.pbrMetallicRoughness.baseColorFactor;
        near(factor.slice(0, 3), srgb.map(srgbToLinear));
        expect(factor[3]).toBe(1);
      }
      expect(inst.family).toBeTruthy();
    }
  });

  it('converts sRGB to linear with the standard transfer function', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 12);
    expect(srgbToLinear(0.5)).toBeCloseTo(0.214_041_14, 6);
  });
});

describe('glb export: deadvox model entry', () => {
  it('sets grip.at to the selected hold anchor in metres and deadvox axes', () => {
    for (const name of ['archetype-ar', 'archetype-pistol', 'archetype-bolt-rifle']) {
      const out = exported(design(name));
      const selected = selectGunAnchors(out.resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY) as SelectedAnchors;
      near(
        out.modelEntry.grip.at,
        toFileAxes(selected.hold.position).map((x) => x * S),
        6,
      );
      expect(out.modelEntry.file).toBe(ASSET.file);
      expect(out.modelEntry.id).toBe(ASSET.id);
    }
  });

  it('emits muzzle and support anchors in metres when the design has them', () => {
    const out = exported(design('archetype-ar'));
    const selected = selectGunAnchors(out.resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY) as SelectedAnchors;
    expect(Object.keys(out.modelEntry.anchors ?? {}).sort()).toEqual(['muzzle', 'support']);
    near(
      out.modelEntry.anchors!.muzzle!,
      selected.others.muzzle!.position.map((x) => x * S),
      6,
    );
    near(
      out.modelEntry.anchors!.support!,
      selected.others.support!.position.map((x) => x * S),
      6,
    );
  });

  it('emits the fixed axis-mapping turn, not one derived from the grip', () => {
    for (const name of ['archetype-ar', 'archetype-pistol', 'archetype-ak']) {
      expect(exported(design(name)).modelEntry.grip.turn).toEqual(gripTurn());
    }
  });

  it('gives the same turn for designs whose hold frames lean differently', () => {
    const upright = exported(design('archetype-bolt-rifle'));
    const raked = exported(design('archetype-ar'));
    const tilt = (out: typeof upright) => {
      const s = selectGunAnchors(out.resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY) as SelectedAnchors;
      return s.hold.up[1];
    };
    // The frames really differ in lean: one hold frame is raked, the other is not.
    expect(Math.min(tilt(upright), tilt(raked))).toBeLessThan(0.99);
    expect(Math.abs(tilt(upright) - tilt(raked))).toBeGreaterThan(0.01);
    expect(raked.modelEntry.grip.turn).toEqual(upright.modelEntry.grip.turn);
  });

  it('gives the same turn for an arbitrary hold-frame lean fed to the core exporter', () => {
    const resolved = resolve(design('archetype-ar'), gunDomain);
    const base = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY) as SelectedAnchors;
    const turnFor = (deg: number) => {
      const c = Math.cos((deg * Math.PI) / 180);
      const s = Math.sin((deg * Math.PI) / 180);
      const anchors: SelectedAnchors = {
        hold: { position: base.hold.position, forward: [c, s, 0], up: [-s, c, 0] },
        others: base.others,
      };
      const r = exportGlb({ resolved, anchors, palette: GUN_PALETTE, asset: ASSET });
      if (!r.ok) {
        throw new Error('export failed');
      }
      return r.modelEntry.grip.turn;
    };
    expect(turnFor(0)).toEqual(turnFor(18));
    expect(turnFor(-25)).toEqual(turnFor(18));
  });

  it('is deterministic', () => {
    const a = exportGunGlb(design('archetype-ar'), ASSET);
    const b = exportGunGlb(design('archetype-ar'), ASSET);
    expect(a.ok && b.ok && Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
  });
});

describe('glb export: errors', () => {
  const ar = design('archetype-ar');
  const resolved = resolve(ar, gunDomain);
  const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY) as SelectedAnchors;

  it('returns structure-issues for a structurally broken assembly', () => {
    const broken = variant('archetype-ar', (a) => {
      a.connections.push({ from: 'receiver.nope', to: 'grip.top' });
    });
    const result = exportGunGlb(broken, ASSET);
    expect(result.ok).toBe(false);
    if (!result.ok && 'issues' in result.error) {
      expect(result.error.code).toBe('structure-issues');
      expect(result.error.issues.length).toBeGreaterThan(0);
    } else {
      throw new Error('expected structure-issues');
    }
  });

  it('returns unplaced-parts for a part the resolver left unplaced', () => {
    const placed = new Map(resolved.placed);
    placed.delete('grip');
    const result = exportGlb({
      resolved: { ...resolved, placed, issues: [] },
      anchors,
      palette: GUN_PALETTE,
      asset: ASSET,
    });
    expect(result).toEqual({ ok: false, error: { code: 'unplaced-parts', partIds: ['grip'] } });
  });

  it('returns invalid-port-id for a part or port id with a dot or nothing in it', () => {
    const def = resolved.defs.get('barrel')!;
    const withPort = (id: string) =>
      new Map(resolved.defs).set('barrel', { ...def, ports: def.ports.map((p, i) => (i === 0 ? { ...p, id } : p)) });
    for (const id of ['a.b', '']) {
      const result = exportGlb({
        resolved: { ...resolved, defs: withPort(id) },
        anchors,
        palette: GUN_PALETTE,
        asset: ASSET,
      });
      expect(result).toEqual({ ok: false, error: { code: 'invalid-port-id', id: `barrel.${id}` } });
    }
  });

  it('returns invalid-palette-color for a channel outside [0, 1] or not finite', () => {
    for (const bad of [
      [1.5, 0, 0],
      [0, Number.NaN, 0],
      [0, 0, -0.1],
    ] as const) {
      const palette: Palette = { ...GUN_PALETTE, familyColors: { ...GUN_PALETTE.familyColors, receiver: bad } };
      expect(exportGlb({ resolved, anchors, palette, asset: ASSET })).toEqual({
        ok: false,
        error: { code: 'invalid-palette-color', key: 'family receiver' },
      });
    }
    const special: Palette = { ...GUN_PALETTE, fallbackColor: [0, 0, 2] };
    expect(exportGlb({ resolved, anchors, palette: special, asset: ASSET })).toEqual({
      ok: false,
      error: { code: 'invalid-palette-color', key: 'fallback' },
    });
  });

  it('returns invalid-asset-file for a bad asset path', () => {
    for (const file of [
      'models/x.glb',
      'assets/models/Rifle.glb',
      'assets/models/a/b.glb',
      'assets/models/.glb',
      'assets/models/x.gltf',
    ]) {
      const result = exportGunGlb(ar, { id: 'x', file: file as GlbAssetIdentity['file'] });
      expect(result).toEqual({ ok: false, error: { code: 'invalid-asset-file', file } });
    }
  });
});
