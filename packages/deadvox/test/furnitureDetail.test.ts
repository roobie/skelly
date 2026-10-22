import { Box3, Color, Mesh, type MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import type { FurnitureDef } from '../src/core/schema.ts';
import type { Facing } from '../src/core/templates.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { buildFixtureRegistry as buildRegistry, FIXTURE_MATERIAL, fixtureBreach } from './economyFixtures.ts';

const definitions = [
  { kind: 'cabinet', surface: 'wood', size: [3, 4, 1] },
  { kind: 'drawers', surface: 'plastic', size: [2, 2, 1] },
  { kind: 'fridge', surface: 'painted-metal', size: [2, 4, 2] },
].map(({ kind, surface, size }, index) => ({
  id: `detail_fixture_${index}`,
  name: 'Detail fixture',
  size,
  color: '#8a7654',
  appearance: { kind, surface },
  container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 1 }] },
  breach: fixtureBreach(),
  material: FIXTURE_MATERIAL,
}));

function fixture() {
  const { registry, issues } = buildRegistry([{ source: 'detail-fixture.json', data: { furniture: definitions } }]);
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  return { registry, entities: new BlockEntities(registry), furniture: new FurnitureMeshes(0.5) };
}

describe('furniture detail', () => {
  it('merges coloured detail into one draw object inside the rotated fixture envelope, with frontmost relief on its facing side', () => {
    const { registry, entities, furniture } = fixture();
    const facings: Facing[] = ['e', 's', 'w', 'n'];
    const outward = {
      n: new Vector3(0, 0, -1),
      e: new Vector3(1, 0, 0),
      s: new Vector3(0, 0, 1),
      w: new Vector3(-1, 0, 0),
    };
    for (const [index, definition] of definitions.entries()) {
      const def = registry.furniture.get(definition.id)!;
      const facing = facings[index]!;
      const size: [number, number, number] =
        facing === 'e' || facing === 'w' ? [def.size[2], def.size[1], def.size[0]] : [...def.size];
      const entity = entities.add({ type: def.id, size, pos: [index * 8, 2, 3], facing })!;
      furniture.sync(entities);
      furniture.group.updateMatrixWorld(true);
      const mesh = furniture.group.children[index] as Mesh;
      expect(mesh).toBeInstanceOf(Mesh);
      expect(mesh.geometry.groups).toEqual([]);
      expect(Array.isArray(mesh.material)).toBe(false);
      expect((mesh.material as MeshLambertMaterial).vertexColors).toBe(true);
      const envelope = new Box3(
        new Vector3(...entity.pos).multiplyScalar(0.5),
        new Vector3(...entity.pos).add(new Vector3(...size)).multiplyScalar(0.5),
      );
      const bounds = new Box3().setFromObject(mesh);
      expect(envelope.clone().expandByScalar(1e-6).containsBox(bounds)).toBe(true);
      const positions = mesh.geometry.getAttribute('position');
      const front = mesh.geometry.boundingBox!.min.z;
      const reliefCenter = new Vector3();
      let reliefVertices = 0;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        if (Math.abs(positions.getZ(vertex) - front) < 1e-6) {
          reliefCenter.add(new Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld));
          reliefVertices += 1;
        }
      }
      expect(reliefVertices).toBeGreaterThan(0);
      reliefCenter.divideScalar(reliefVertices).sub(envelope.getCenter(new Vector3()));
      expect(reliefCenter.dot(outward[facing])).toBeGreaterThan(0);
    }
    expect(furniture.group.children.filter((child) => child instanceof Mesh)).toHaveLength(definitions.length);
  });

  it('reuses detail geometry across instances and search redraws, and leaves unchanged frames alone', () => {
    const { registry, entities, furniture } = fixture();
    const def = registry.furniture.get(definitions[0]!.id)! as FurnitureDef;
    const first = entities.add({ type: def.id, size: def.size, pos: [0, 0, 0], facing: 'n' })!;
    entities.add({ type: def.id, size: def.size, pos: [5, 0, 0], facing: 'n' });
    furniture.sync(entities);
    const meshes = furniture.group.children.filter((child): child is Mesh => child instanceof Mesh);
    const { geometry } = meshes[0]!;
    expect(geometry).toBe(meshes[1]!.geometry);
    furniture.sync(entities);
    expect(furniture.group.children[0]).toBe(meshes[0]);
    entities.markSearched(first);
    furniture.sync(entities);
    expect((furniture.group.children[0] as Mesh).geometry).toBe(geometry);
  });

  it('paints shape boxes with their own colour, falling back to the furniture colour', () => {
    const { registry, issues } = buildRegistry([
      {
        source: 'tinted.json',
        data: {
          furniture: [
            {
              id: 'tinted_heap',
              name: 'Heap',
              size: [2, 1, 2],
              color: '#102030',
              shape: [
                { position: [0, 0, 0], size: [1, 0.5, 1], color: '#ff0000' },
                { position: [1, 0, 1], size: [1, 0.5, 1] },
              ],
              solidFill: 0.01,
              breach: fixtureBreach(),
              material: FIXTURE_MATERIAL,
            },
          ],
        },
      },
    ]);
    expect(issues).toEqual([]);
    const entities = new BlockEntities(registry);
    const meshes = new FurnitureMeshes(0.5);
    entities.add({ type: 'tinted_heap', size: [2, 1, 2], pos: [0, 0, 0], facing: 'n' });
    meshes.sync(entities);
    const mesh = meshes.group.children[0] as Mesh;
    const colors = mesh.geometry.getAttribute('color');
    const painted = new Set<string>();
    for (let vertex = 0; vertex < colors.count; vertex++) {
      painted.add([colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex)].map((c) => c.toFixed(3)).join());
    }
    const expected = new Set(
      ['#ff0000', '#102030'].map((hex) => {
        const color = new Color(hex);
        return [color.r, color.g, color.b].map((c) => c.toFixed(3)).join();
      }),
    );
    expect(painted).toEqual(expected);
  });

  it('rejects detail on furniture whose other visual authority would hide it', () => {
    const definition = definitions[0]!;
    for (const extra of [
      { shape: [{ position: [0, 0, 0], size: [1, 1, 1] }] },
      { door: { methods: {}, handlingSimSeconds: 1 } },
      { container: undefined },
    ]) {
      const { issues } = buildRegistry([
        { source: 'invalid-detail.json', data: { furniture: [{ ...definition, ...extra }] } },
      ]);
      expect(issues.length).toBeGreaterThan(0);
    }
  });
});
