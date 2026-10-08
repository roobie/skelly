import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MetallicCartridge } from '../src/ammo/cartridge.ts';
import type { GlbAssetIdentity, Palette } from '../src/core/design.ts';
import { displayItems as selectDisplayItems } from '../src/core/display.ts';
import { localSolidBounds, penetrationWorld, worldBox, worldSolid } from '../src/core/geometry.ts';
import { exportGlb, partNodeName, srgbToLinear } from '../src/core/glb.ts';
import { applyPoint, IDENTITY, type Mat3, mulMM, mulMV, rotX, rotY, rotZ, sub, type Vec3 } from '../src/core/math.ts';
import { meshForSolid, meshForSolidGroup } from '../src/core/mesh.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly } from '../src/core/schema.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import type { SelectedAnchors } from '../src/gun/anchors.ts';
import { GUN_ANCHOR_POLICY, selectGunAnchors } from '../src/gun/anchors.ts';
import { ACTION_CYCLE_PROFILES } from '../src/gun/cycle.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { ejectionPoint } from '../src/gun/ejection.ts';
import { eulerXyzDegrees, FILE_FROM_GUNGEN, gripTurn, METRES_PER_UNIT, toFileAxes } from '../src/gun/exportFrame.ts';
import { createGunModelEntry, exportGunGlb } from '../src/gun/exportGlb.ts';
import { getOptic } from '../src/gun/optics.ts';
import { GUN_PALETTE, resolveAppearance } from '../src/gun/palette.ts';
import { FAMILIES } from '../src/gun/parts.ts';
import { loadCartridgeFile } from './ammoHelpers.ts';
import { type ReadGlb, readGlb } from './glbReader.ts';
import { expectWatertightMesh, loadCorpus, variant } from './helpers.ts';

const design = (name: string): Assembly => {
  const result = loadGunDesign(readFileSync(join(import.meta.dirname, '..', 'designs', `${name}.json`), 'utf8'));
  if (!result.ok) {
    throw new Error(`${name}: ${result.error.message}`);
  }
  return result.design.assembly;
};

const ASSET: GlbAssetIdentity = { id: 'rifle_test', file: 'assets/models/rifle_test.glb' };
const S = METRES_PER_UNIT;
const CARRIER_ENDPOINT_PREFIX = /^bolt-carrier\./;
const AK_CARTRIDGE = loadCartridgeFile('7.62x39.json') as MetallicCartridge;
const exported = (assembly: Assembly, asset: GlbAssetIdentity = ASSET, variantName?: string) => {
  const result = exportGunGlb(assembly, asset, { variant: variantName ?? 'ar' });
  if (!result.ok) {
    throw new Error(`export failed: ${JSON.stringify(result.error)}`);
  }
  return { ...result, read: readGlb(result.glb), resolved: resolve(assembly, gunDomain) };
};

type ExportedGun = ReturnType<typeof exported>;
const actionExportFacts = (name: string) => {
  const out = exported(design(name));
  const action = out.modelEntry.action!;
  if (!(action.fire && action.roundsPerSimMinute)) {
    throw new Error('automatic actions require fire timing and roundsPerSimMinute');
  }
  const parts = Object.values(action.parts).map((part) => {
    const node = out.read.json.nodes.find(({ name: nodeName }) => nodeName === part.node)!;
    const partId = part.node.split(':')[0]!;
    const partMotion = out.resolved.defs.get(partId)?.motion;
    if (!partMotion) {
      throw new Error(`${partId} has no source motion`);
    }
    return {
      hasMesh: node.mesh !== undefined,
      axisLength: Math.hypot(...part.axis),
      strokeMetres: part.strokeMetres,
      expectedStrokeMetres:
        Math.hypot(...sub(partMotion.end, partMotion.start)) * out.resolved.domain.units.metresPerUnit,
    };
  });
  const core = exportGlb({
    resolved: out.resolved,
    palette: GUN_PALETTE,
    appearance: { variant: 'ar' },
    asset: ASSET,
  });
  return {
    rpm: action.roundsPerSimMinute,
    holdOpen: action.holdOpen,
    fireDuration: action.fire.durationSimSeconds,
    handDuration: action.hand.durationSimSeconds,
    phases: [
      action.fire.rearwardSimSeconds,
      action.fire.dwellSimSeconds,
      action.fire.forwardSimSeconds,
      action.hand.rearwardSimSeconds,
      action.hand.dwellSimSeconds,
      action.hand.forwardSimSeconds,
    ],
    ejectAt: action.ejectAt,
    modes: Object.fromEntries(Object.entries(action.parts).map(([role, part]) => [role, part.modes])),
    parts,
    ejectDirectionLength: Math.hypot(...action.ejectDirection),
    exportedEjectDirection: Object.hasOwn(out.modelEntry, 'ejectDirection'),
    hasEjectionAnchor: out.modelEntry.anchors?.ejection !== undefined,
    carrierAxis: out.resolved.defs.get('bolt-carrier')!.motion!.axis,
    coreOk: core.ok,
    sameGlb: Buffer.from(out.glb).equals(Buffer.from(core.ok ? core.glb : [])),
  };
};
const sightTargetPartId = (out: ExportedGun, endpoint: Vec3, label: string): string => {
  for (const [id, part] of out.resolved.defs) {
    const axis = part.axes.find(({ kind }) => kind === 'sight');
    const transform = out.resolved.placed.get(id);
    if (!(axis && transform)) {
      continue;
    }
    const { family } = out.resolved.assembly.parts[id]!;
    const params = out.resolved.params.get(id);
    const optic = family === 'sight' ? getOptic(params?.type?.value, params?.mountSection?.value) : undefined;
    const localEye: Vec3 = optic ? [optic.ocularX, optic.opticalAxisY, 0] : axis.origin;
    const eye = applyPoint(transform, localEye);
    if (Math.hypot(eye[0] - endpoint[0], eye[1] - endpoint[1], eye[2] - endpoint[2]) < 1e-6) {
      return id;
    }
  }
  throw new Error(`${label}: exported sight endpoint does not match a sight part`);
};

const expectSightLineClear = (out: ExportedGun, label: string): void => {
  const { sight } = out.modelEntry;
  if (!sight) {
    throw new Error(`${label}: export has no sight metadata`);
  }
  const endpoint = sight.eye.map((value) => value / S) as unknown as Vec3;
  const targetId = sightTargetPartId(out, endpoint, label);
  const eyeRelief = sight.eyeReliefMetres / S;
  const eyePoint: Vec3 = [
    endpoint[0] - sight.direction[0] * eyeRelief,
    endpoint[1] - sight.direction[1] * eyeRelief,
    endpoint[2] - sight.direction[2] * eyeRelief,
  ];
  const center: Vec3 = [
    (eyePoint[0] + endpoint[0]) / 2,
    (eyePoint[1] + endpoint[1]) / 2,
    (eyePoint[2] + endpoint[2]) / 2,
  ];
  const sightLine = worldBox(IDENTITY, { center, half: [eyeRelief / 2, 0.05, 0.05] });
  for (const [id, part] of out.resolved.defs) {
    if (id === targetId) {
      continue;
    }
    const placed = out.resolved.placed.get(id)!;
    for (const solid of part.solids) {
      // biome-ignore lint/suspicious/noMisplacedAssertion: called from the corpus sight-line test.
      expect(
        penetrationWorld(sightLine, worldSolid(placed, solid)),
        `${label}: ${id}.${solid.id} blocks the sight line`,
      ).toBeLessThanOrEqual(0);
    }
  }
};

const near = (a: readonly number[], b: readonly number[], digits = 6): void => {
  // biome-ignore lint/suspicious/noMisplacedAssertion: a small comparison helper called from tests
  expect(a).toEqual(b.map((x) => expect.closeTo(x, digits)));
};

const glbIndices = (glb: ReadGlb, accessorIndex: number): Uint32Array => {
  const accessor = glb.json.accessors[accessorIndex]!;
  const bufferView = glb.json.bufferViews[accessor.bufferView]!;
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength);
  return Uint32Array.from({ length: accessor.count }, (_, index) =>
    view.getUint32(bufferView.byteOffset + index * 4, true),
  );
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
  it('calibrates the shared STANAG top against Brownells listed body depth within one grid step', () => {
    const stanag = FAMILIES.magazine!.build({ length: 'M', profile: 'stanag-curved' });
    const upperBody = stanag.solids.find(({ id }) => id === 'upper-body')!;
    const [min, max] = localSolidBounds(upperBody);
    const topDepthUnits = max[0]! - min[0]!;
    const authoredDepthMm = topDepthUnits * METRES_PER_UNIT * 1000;
    const listedBodyDepthMm = 64.5;
    const gridStepMm = gunDomain.units.grid * METRES_PER_UNIT * 1000;
    expect(Math.abs(authoredDepthMm - listedBodyDepthMm)).toBeLessThanOrEqual(gridStepMm);
    expect(METRES_PER_UNIT).toBe(gunDomain.units.metresPerUnit);
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
  const ar = exported(design('archetype-ar'), ASSET, 'ar');

  it('writes a valid glb 2.0 container with one scene and reports the shared material count', () => {
    expect(ar.read.json.asset.version).toBe('2.0');
    expect(ar.read.json.scenes).toHaveLength(1);
    const root = ar.read.json.nodes[ar.read.json.scenes[0]!.nodes[0]!]!;
    expect(root.name).toBe(ASSET.id);
    expect((root.extras!.gungen as { materialCount: number }).materialCount).toBe(ar.read.json.materials.length);
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
  const ar = exported(design('archetype-ar'), ASSET, 'ar');
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
  const ar = exported(design('archetype-ar'), ASSET, 'ar');
  const { json } = ar.read;

  const drawn = (id: string) => {
    const def = ar.resolved.defs.get(id)!;
    return def.displaySolids ?? def.solids;
  };
  const displayItems = (id: string) =>
    selectDisplayItems(drawn(id)).map((item) => ({
      ...item,
      mesh: item.merged ? meshForSolidGroup(item.solids) : meshForSolid(item.solids[0]!),
    }));

  it('exports the merged AR receiver as the same closed, manifold mesh', () => {
    const receiverMesh = displayItems('receiver').find(({ id }) => id === 'receiver-ar')!.mesh;
    expectWatertightMesh(receiverMesh, 'AR source receiver');
    const receiverNode = json.nodes.find((node) => node.extras?.part === 'receiver')!;
    const primitive = json.meshes[receiverNode.mesh!]!.primitives.find(
      (entry) => (entry.extras as Record<string, unknown> | undefined)?.mergeGroup === 'receiver-ar',
    )!;
    const positions = ar.read.floats(primitive.attributes.POSITION);
    const indices = glbIndices(ar.read, primitive.indices);
    expect(positions.length).toBe(receiverMesh.positions.length);
    expect(indices).toEqual(receiverMesh.indices);
    near(
      Array.from(positions),
      Array.from(receiverMesh.positions, (value) => value * S),
      7,
    );
    expectWatertightMesh(
      {
        positions: Float32Array.from(positions, (value) => value / S),
        normals: ar.read.floats(primitive.attributes.NORMAL),
        indices,
        triangleCount: indices.length / 3,
      },
      'AR exported receiver',
    );
  });

  it.each([
    { designName: 'archetype-ak', group: 'receiver-ak' },
    { designName: 'archetype-pump-shotgun', group: 'receiver-pump' },
  ])('exports the $group receiver as the same closed merged mesh', ({ designName, group }) => {
    const model = exported(design(designName), ASSET, designName.replace('archetype-', ''));
    const def = model.resolved.defs.get('receiver')!;
    const solids = (def.displaySolids ?? def.solids).filter((solid) => solid.display?.mergeGroup === group);
    const expectedMesh = meshForSolidGroup(solids);
    expectWatertightMesh(expectedMesh, `${designName}: source topology`);
    const node = model.read.json.nodes.find((entry) => entry.extras?.part === 'receiver')!;
    const primitive = model.read.json.meshes[node.mesh!]!.primitives.find(
      (entry) => (entry.extras as Record<string, unknown> | undefined)?.mergeGroup === group,
    )!;
    const positions = model.read.floats(primitive.attributes.POSITION);
    const indices = glbIndices(model.read, primitive.indices);
    expect(indices).toEqual(expectedMesh.indices);
    near(
      Array.from(positions),
      Array.from(expectedMesh.positions, (value) => value * S),
      7,
    );
    expectWatertightMesh(
      {
        positions: Float32Array.from(positions, (value) => value / S),
        normals: model.read.floats(primitive.attributes.NORMAL),
        indices,
        triangleCount: indices.length / 3,
      },
      `${designName}: exported topology`,
    );
  });

  it('draws normal solids individually and section shells as one merged primitive', () => {
    for (const id of Object.keys(ar.resolved.assembly.parts)) {
      const node = json.nodes.find((n) => n.extras?.part === id)!;
      const prims = json.meshes[node.mesh!]!.primitives;
      expect(
        prims.map((p) => {
          const extras = p.extras as Record<string, unknown> | undefined;
          return extras?.solid ?? extras?.mergeGroup;
        }),
      ).toEqual(displayItems(id).map(({ id: itemId }) => itemId));
    }
  });

  it.each(Object.keys(ar.resolved.assembly.parts))('matches mesh.ts bounds times the metre scale for %s', (id) => {
    const node = json.nodes.find((n) => n.extras?.part === id)!;
    const prims = json.meshes[node.mesh!]!.primitives;
    displayItems(id).forEach(({ mesh }, i) => {
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this contract walks exported primitives and compares full material metadata against each source solid.
  it('colours each solid with the palette converted from sRGB to linear', () => {
    for (const [id, inst] of Object.entries(ar.resolved.assembly.parts)) {
      const role = ar.resolved.defs.get(id)!.family;
      const node = json.nodes.find((n) => n.extras?.part === id)!;
      for (const prim of json.meshes[node.mesh!]!.primitives) {
        const extras = prim.extras as Record<string, unknown> | undefined;
        const groupedSolids = extras?.solids as string[] | undefined;
        const solidId = (extras?.solid as string | undefined) ?? groupedSolids?.[0];
        if (!solidId) {
          throw new Error(`No source solid for ${id} primitive ${prim.indices}.`);
        }
        const solid = [...(ar.resolved.defs.get(id)!.displaySolids ?? ar.resolved.defs.get(id)!.solids)].find(
          (candidate) => candidate.id === solidId,
        );
        const appearance = resolveAppearance(GUN_PALETTE, role, solidId, {
          archetype: 'ar',
          ...(ar.resolved.defs.get(id)!.material ? { material: ar.resolved.defs.get(id)!.material } : {}),
          ...(ar.resolved.defs.get(id)!.slot ? { slot: ar.resolved.defs.get(id)!.slot } : {}),
        });
        if (solid?.material) {
          expect(extras?.material).toBe(solid.material);
          expect(extras?.slot).toBe(solid.slot);
          continue;
        }
        const factor = json.materials[prim.material]!.pbrMetallicRoughness.baseColorFactor;
        near(factor.slice(0, 3), appearance.color.map(srgbToLinear));
        expect(extras?.material).toBe(appearance.material);
        expect(extras?.slot).toBe(appearance.slot);
        expect(factor[3]).toBe(1);
      }
      expect(inst.family).toBeTruthy();
    }
  });

  it('exports butt-pad and floorplate primitive extras in the independently specified accent slot', () => {
    const pump = exported(design('archetype-pump-shotgun'), ASSET, 'pump-shotgun');
    const compactBolt = exported(design('archetype-bolt-rifle-box'), ASSET, 'bolt-rifle-box');
    const primitive = (glb: ReadGlb, solid: string) =>
      glb.json.meshes
        .flatMap((mesh) => mesh.primitives)
        .find((candidate) => (candidate.extras as Record<string, unknown> | undefined)?.solid === solid);
    expect(primitive(pump.read, 'butt-pad')?.extras).toMatchObject({ material: 'rubber-black', slot: 'accent' });
    expect(primitive(compactBolt.read, 'floorplate')?.extras).toMatchObject({
      material: 'steel-blued',
      slot: 'accent',
    });
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

  it('exports sight metadata for every valid fixture and published firearm design', () => {
    for (const { label, assembly } of loadCorpus()) {
      const result = exportGunGlb(assembly, ASSET, { variant: 'ar' });
      if (!result.ok) {
        throw new Error(`${label}: export failed: ${JSON.stringify(result.error)}`);
      }
      expect(result.modelEntry.sight, `${label} should export sight metadata from its parts`).toBeDefined();
    }
  });

  it('exports optic ocular diameter and eye relief with the sight line', () => {
    const optic = exported(design('archetype-ar'));
    const iron = exported(design('archetype-ak'));
    expect(optic.modelEntry.sight?.eyeReliefMetres).toBeGreaterThan(0);
    expect(optic.modelEntry.sight?.ocularDiameterMetres).toBeGreaterThan(0);
    expect(iron.modelEntry.sight?.eyeReliefMetres).toBeGreaterThan(0);
    expect(iron.modelEntry.sight?.ocularDiameterMetres).toBeUndefined();
  });

  it('aims the pump shotgun front bead along a clear line above the barrel', () => {
    const out = exported(design('archetype-pump-shotgun'));
    const beadId = Object.entries(out.resolved.assembly.parts).find(
      ([, part]) => part.family === 'front-sight-bead',
    )?.[0];
    if (!(beadId && out.modelEntry.sight)) {
      throw new Error('pump shotgun needs its front bead in the exported sight data');
    }
    const beadAxis = out.resolved.defs.get(beadId)!.axes.find(({ kind }) => kind === 'sight')!;
    const beadTransform = out.resolved.placed.get(beadId)!;
    const beadTop = applyPoint(beadTransform, beadAxis.origin);
    const receiverId = Object.entries(out.resolved.assembly.parts).find(([, part]) => part.family === 'receiver')?.[0];
    if (!receiverId) {
      throw new Error('pump shotgun needs a receiver to derive its bead eye line');
    }
    const receiver = out.resolved.defs.get(receiverId)!;
    const receiverTransform = out.resolved.placed.get(receiverId)!;
    const bounds = receiver.solids.map(localSolidBounds);
    const minimum: Vec3 = [
      Math.min(...bounds.map(([min]) => min[0])),
      Math.min(...bounds.map(([min]) => min[1])),
      Math.min(...bounds.map(([min]) => min[2])),
    ];
    const maximum: Vec3 = [
      Math.max(...bounds.map(([, max]) => max[0])),
      Math.max(...bounds.map(([, max]) => max[1])),
      Math.max(...bounds.map(([, max]) => max[2])),
    ];
    const receiverTop = applyPoint(receiverTransform, [
      (minimum[0] + maximum[0]) / 2,
      maximum[1],
      (minimum[2] + maximum[2]) / 2,
    ]);
    const eyePoint: Vec3 = [receiverTop[0], beadTop[1], receiverTop[2]];
    const eyeToBead = sub(beadTop, eyePoint);
    const sightLength = Math.hypot(...eyeToBead);
    const expectedDirection: Vec3 = [
      eyeToBead[0] / sightLength,
      eyeToBead[1] / sightLength,
      eyeToBead[2] / sightLength,
    ];
    const scale = out.resolved.domain.units.metresPerUnit;
    const exportedEye: Vec3 = out.modelEntry.sight.eye.map((value) => value / scale) as unknown as Vec3;
    const exportedDirection = out.modelEntry.sight.direction;
    const exportedEyePoint: Vec3 = [
      exportedEye[0] - exportedDirection[0] * (out.modelEntry.sight.eyeReliefMetres / scale),
      exportedEye[1] - exportedDirection[1] * (out.modelEntry.sight.eyeReliefMetres / scale),
      exportedEye[2] - exportedDirection[2] * (out.modelEntry.sight.eyeReliefMetres / scale),
    ];
    expect(eyePoint[1]).toBeGreaterThan(receiverTop[1]);
    expect(eyePoint[0]).toBeLessThan(beadTop[0]);
    near(exportedEyePoint, eyePoint);
    near(exportedDirection, toFileAxes(expectedDirection));
    expect(out.modelEntry.sight.kind).toBe('iron');
  });

  it('keeps every exported sight line clear of other solids', () => {
    const corpus = loadCorpus();
    expect(corpus.length).toBeGreaterThan(0);
    for (const { label, assembly } of corpus) {
      expectSightLineClear(exported(assembly), label);
    }
  });

  it('aims the AK sight axis from the rear notch top edge to the front post tip', () => {
    const out = exported(design('archetype-ak'));
    const rearId = Object.entries(out.resolved.assembly.parts).find(([, part]) => part.family === 'ak-rear-sight')?.[0];
    const frontId = Object.entries(out.resolved.assembly.parts).find(([, part]) => part.family === 'front-sight')?.[0];
    if (!(rearId && frontId && out.modelEntry.sight)) {
      throw new Error('AK design needs rear and front sights');
    }
    const rearAxis = out.resolved.defs.get(rearId)!.axes.find(({ kind }) => kind === 'sight')!;
    const frontAxis = out.resolved.defs.get(frontId)!.axes.find(({ kind }) => kind === 'sight')!;
    const eye = applyPoint(out.resolved.placed.get(rearId)!, rearAxis.origin);
    const postTip = applyPoint(out.resolved.placed.get(frontId)!, frontAxis.origin);
    const vector: Vec3 = [postTip[0] - eye[0], postTip[1] - eye[1], postTip[2] - eye[2]];
    const magnitude = Math.hypot(...vector);
    const expectedDirection: Vec3 = toFileAxes([vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude]);
    near(out.modelEntry.sight.direction, expectedDirection);

    const rear = out.resolved.defs.get(rearId)!;
    const front = out.resolved.defs.get(frontId)!;
    const leaf = rear.solids.find(({ id }) => id === 'leaf-left')!;
    const opposite = rear.solids.find(({ id }) => id === 'leaf-right')!;
    const post = front.solids.find(({ id }) => id === 'post')!;
    if (leaf.kind !== 'box' || opposite.kind !== 'box' || post.kind !== 'box') {
      throw new Error('AK notch sides and post need box dimensions');
    }
    const notchWidth = opposite.box.center[2] - opposite.box.half[2] - (leaf.box.center[2] + leaf.box.half[2]);
    const leafWidth = opposite.box.center[2] + opposite.box.half[2] - (leaf.box.center[2] - leaf.box.half[2]);
    const leafHeight = leaf.box.half[1] * 2;
    const leafTop = applyPoint(out.resolved.placed.get(rearId)!, [0, leaf.box.center[1] + leaf.box.half[1], 0]);
    expect(eye[1]).toBeCloseTo(leafTop[1], 7);
    expect(postTip[1]).toBeCloseTo(leafTop[1], 7);
    expect(post.box.half[2] * 2).toBeLessThan(notchWidth);
    expect(notchWidth).toBeLessThan(leafWidth / 2);
    expect(leafWidth).toBeGreaterThan(leafHeight);
  });
  it('emits muzzle and support anchors in metres when the design has them', () => {
    const out = exported(design('archetype-ar'));
    const selected = selectGunAnchors(out.resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY) as SelectedAnchors;
    expect(Object.keys(out.modelEntry.anchors ?? {}).sort()).toEqual(['ejection', 'muzzle', 'support']);
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
    near(
      out.modelEntry.anchors!.ejection!,
      ejectionPoint(out.resolved)!.map((x) => x * S),
      6,
    );
  });

  it('retains action metadata when the carrier instance is consistently renamed', () => {
    const assembly = design('archetype-ar');
    expect(exported(assembly).modelEntry.action).toBeDefined();
    const renamed: Assembly = {
      ...assembly,
      parts: Object.fromEntries(
        Object.entries(assembly.parts).map(([id, part]) => [id === 'bolt-carrier' ? 'carrier-renamed' : id, part]),
      ),
      connections: assembly.connections.map((connection) => ({
        ...connection,
        from: connection.from.replace(CARRIER_ENDPOINT_PREFIX, 'carrier-renamed.'),
        to: connection.to.replace(CARRIER_ENDPOINT_PREFIX, 'carrier-renamed.'),
      })),
    };
    const out = exported(renamed);
    expect(out.read.json.nodes.some((node) => node.name === 'carrier-renamed:bolt-carrier')).toBe(true);
    expect(out.modelEntry.action, 'identity-only changes must not silently drop action data').toBeDefined();
    expect(out.modelEntry.action!.parts.carrier!.node).toBe('carrier-renamed:bolt-carrier');
  });

  it.each([
    ['archetype-ak', 'ak', false, { carrier: ['fire', 'hand'] }],
    ['archetype-ar', 'ar', true, { carrier: ['fire', 'hand'], handle: ['hand'] }],
  ] as const)(
    'exports action nodes, estimated cycles and ejection metadata for %s without changing GLB bytes',
    (name, expectedAction, holdOpen, expectedModes) => {
      const facts = actionExportFacts(name);
      expect(facts.rpm).toBe(ACTION_CYCLE_PROFILES[expectedAction].rpm);
      expect(facts.holdOpen).toBe(holdOpen);
      expect(facts.fireDuration).toBeCloseTo(60 / facts.rpm, 9);
      expect(facts.handDuration).toBeGreaterThan(facts.fireDuration);
      expect(facts.phases.every((duration) => duration > 0)).toBe(true);
      expect(facts.ejectAt).toBeGreaterThan(0);
      expect(facts.ejectAt).toBeLessThan(1);
      expect(facts.modes).toEqual(expectedModes);
      expect(
        facts.parts.every(
          ({ hasMesh, axisLength, strokeMetres, expectedStrokeMetres }) =>
            hasMesh && Math.abs(axisLength - 1) < 1e-12 && Math.abs(strokeMetres - expectedStrokeMetres) < 1e-6,
        ),
      ).toBe(true);
      expect(facts.ejectDirectionLength).toBeCloseTo(1, 12);
      expect(facts.exportedEjectDirection).toBe(false);
      expect(facts.hasEjectionAnchor).toBe(true);
      expect(facts.carrierAxis).toEqual([1, 0, 0]);
      expect(facts.coreOk).toBe(true);
      expect(facts.sameGlb).toBe(true);
    },
  );

  it('exports the magazine replacement slot regardless of calibre metadata', () => {
    const assembly = design('archetype-ak');
    const appearance = { variant: 'ak' };
    const bare = exportGunGlb(assembly, ASSET, appearance);
    const assigned = exportGunGlb(assembly, ASSET, appearance, { cartridge: AK_CARTRIDGE });
    expect(bare.ok && assigned.ok).toBe(true);
    if (!(bare.ok && assigned.ok)) {
      return;
    }
    expect(bare.modelEntry).not.toHaveProperty('calibre');
    expect(assigned.modelEntry.calibre).toBe('7.62x39');
    const bareSlot = bare.modelEntry.slots?.magazine;
    const assignedSlot = assigned.modelEntry.slots?.magazine;
    expect(bare.modelEntry.anchors?.magwell).toBeUndefined();
    expect(assigned.modelEntry.anchors?.magwell).toBeUndefined();
    expect(bareSlot).toBeDefined();
    expect(assignedSlot).toBeDefined();
    expect(assignedSlot?.node).toBe(bareSlot?.node);
    expect(assignedSlot?.at).toEqual(bareSlot?.at);
    expect(assignedSlot?.turn).toEqual(bareSlot?.turn);
    expect(readGlb(bare.glb).json.nodes.map(({ name }) => name)).toContain(bareSlot?.node);
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

  it('gives the same turn for an arbitrary hold-frame lean in the gun model entry', () => {
    const resolved = resolve(design('archetype-ar'), gunDomain);
    const base = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY) as SelectedAnchors;
    const turnFor = (deg: number) => {
      const c = Math.cos((deg * Math.PI) / 180);
      const s = Math.sin((deg * Math.PI) / 180);
      const anchors: SelectedAnchors = {
        hold: { position: base.hold.position, forward: [c, s, 0], up: [-s, c, 0] },
        others: base.others,
      };
      return createGunModelEntry({ asset: ASSET, anchors, metresPerUnit: resolved.domain.units.metresPerUnit }).grip
        .turn;
    };
    expect(turnFor(0)).toEqual(turnFor(18));
    expect(turnFor(-25)).toEqual(turnFor(18));
  });

  it('is deterministic', () => {
    const a = exportGunGlb(design('archetype-ar'), ASSET, { variant: 'ar' });
    const b = exportGunGlb(design('archetype-ar'), ASSET, { variant: 'ar' });
    expect(a.ok && b.ok && Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
  });
});

describe('glb export: errors', () => {
  const ar = design('archetype-ar');
  const resolved = resolve(ar, gunDomain);
  it('returns structure-issues for a structurally broken assembly', () => {
    const broken = variant('archetype-ar', (a) => {
      a.connections.push({ from: 'receiver.nope', to: 'grip.top' });
    });
    const result = exportGunGlb(broken, ASSET, { variant: 'ar' });
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
      expect(exportGlb({ resolved, palette, asset: ASSET })).toEqual({
        ok: false,
        error: { code: 'invalid-palette-color', key: 'family receiver' },
      });
    }
    const special: Palette = { ...GUN_PALETTE, fallbackColor: [0, 0, 2] };
    expect(exportGlb({ resolved, palette: special, asset: ASSET })).toEqual({
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
      const result = exportGunGlb(ar, { id: 'x', file: file as GlbAssetIdentity['file'] }, { variant: 'ar' });
      expect(result).toEqual({ ok: false, error: { code: 'invalid-asset-file', file } });
    }
  });
});
