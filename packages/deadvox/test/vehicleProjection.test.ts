import { placeFitting } from '@skelly/engine/internal/core/vehicleBlueprint.ts';
import { projectVehicleParts } from '@skelly/engine/vehicles';
import { applyItemStateLook } from '@skelly/presentation/internal/render/itemStateLook.ts';
import { applyModelMaterials } from '@skelly/presentation/internal/render/modelMaterials.ts';
import { SKY_ANCHOR_ATTRIBUTE } from '@skelly/presentation/internal/render/skyAnchor.ts';
import { VehicleMeshes } from '@skelly/presentation/internal/render/vehicles.ts';
import { MATERIALS, type MaterialDef } from '@skelly/thing-core/materials';
import { BoxGeometry, Color, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createRuntime, registry, scale } from './snapshotTestSupport.ts';

const spec = (placementKey: string, facing: 'n' | 'e' | 's' | 'w' = 'n') => ({
  placementKey,
  blueprint: 'hatchback',
  origin: [12, 7, -8] as [number, number, number],
  facing,
});

const absentLeaf = () => {
  const { fittings } = registry.vehicleBlueprints.get('hatchback')!;
  return fittings.find((fitting) => !fittings.some((other) => other.supportedBy.includes(fitting.id)))!.id;
};

const models = {
  version: 1,
  part: () => new Group(),
};

describe('production vehicle projection', () => {
  it('redraws a vehicle when its finishes switch, so the option applies during play', () => {
    const { inventory } = createRuntime();
    const id = inventory.registerVehicle(spec('projection.finishes'));
    const finishes = { enabled: false, dress: vi.fn() };
    const rendered = new VehicleMeshes(registry, models as never, scale.blockSize, finishes);
    rendered.sync(inventory.vehicles);
    const plain = rendered.groupFor(id);
    expect(finishes.dress).not.toHaveBeenCalled();
    rendered.sync(inventory.vehicles);
    expect(rendered.groupFor(id)).toBe(plain);
    finishes.enabled = true;
    rendered.sync(inventory.vehicles);
    expect(rendered.groupFor(id)).not.toBe(plain);
    expect(finishes.dress).toHaveBeenCalled();
  });

  it('keeps a mirrored render holder and its boxes at the loader placement after the vehicle faces east', () => {
    const { inventory } = createRuntime();
    const id = inventory.registerVehicle(spec('projection.east', 'e'));
    const vehicle = inventory.vehicles.get(id)!;
    const mirrored = vehicle.fittings.find((fitting) => fitting.mirror && fitting.at[0] !== 0)!;
    expect(mirrored.at[0]).not.toBe(0);
    const loaded = placeFitting(registry, {
      id: mirrored.id,
      at: mirrored.at,
      mirror: true,
      supportedBy: mirrored.supportedBy,
      part: mirrored.item.type,
      ...(mirrored.item.cargo ? { cargo: mirrored.item.cargo } : {}),
    });
    const parts = projectVehicleParts(registry, id, vehicle, scale.blockSize);
    const partIndex = parts.findIndex((part) => part.fittingId === mirrored.id);
    const projected = parts[partIndex]!;
    const rendered = new VehicleMeshes(registry, models as never, scale.blockSize);
    rendered.sync(inventory.vehicles);
    const holder =
      rendered.groupFor(id)!.children[parts.slice(0, partIndex + 1).filter((part) => part.model).length - 1]!;
    const [x, y, z] = loaded.lattice!.origin;
    // Facing east turns the vehicle's forward, +z, onto world -z.
    const anchor = [
      vehicle.origin[0] * scale.blockSize - x,
      vehicle.origin[1] * scale.blockSize + y,
      vehicle.origin[2] * scale.blockSize - z,
    ];

    expect(projected.transform.mirror).toBe(true);
    expect(projected.transform.yaw).toBeCloseTo(Math.PI);
    expect(holder.position.toArray()).toEqual(anchor);
    expect(projected.transform.position).toEqual(anchor);
    expect(projected.boxes).toEqual(
      loaded.collision.map(({ min, max }) => ({
        min: [
          vehicle.origin[0] * scale.blockSize - max[0],
          vehicle.origin[1] * scale.blockSize + min[1],
          vehicle.origin[2] * scale.blockSize - max[2],
        ],
        max: [
          vehicle.origin[0] * scale.blockSize - min[0],
          vehicle.origin[1] * scale.blockSize + max[1],
          vehicle.origin[2] * scale.blockSize - min[2],
        ],
      })),
    );
  });

  it('omits an absent fitting from both the render projection and pick boxes', () => {
    const { inventory } = createRuntime();
    const missing = absentLeaf();
    const id = inventory.registerVehicle(spec('projection.absent'), [missing]);
    const parts = projectVehicleParts(registry, id, inventory.vehicles.get(id)!, scale.blockSize);

    expect(parts.some((part) => part.fittingId === missing)).toBe(false);
    expect(parts.every((part) => part.boxes.length > 0)).toBe(true);
  });

  describe('part finish', () => {
    const finishes = [...registry.vehicleFinishes.values()];
    const first = finishes[0]!;
    const second = finishes.find(({ colour }) => colour.some((value, axis) => value !== first.colour[axis]))!;
    const colourOf = ({ colour }: typeof first) => new Color().setRGB(...colour, SRGBColorSpace);
    const library = () => {
      const paint = new MeshStandardMaterial({ color: '#123456' });
      paint.userData = { paintable: true, itemMaterialIndex: 0 };
      const glass = new MeshStandardMaterial({ color: '#abcdef' });
      glass.userData = { itemMaterialIndex: 0 };
      const scene = new Group().add(new Mesh(new BoxGeometry(), paint), new Mesh(new BoxGeometry(), glass));
      return { paint, glass, scene };
    };

    it('paints each copy of one model by its own finish, leaving unmarked materials and the model alone', () => {
      const hatchback = registry.vehicleBlueprints.get('hatchback')!;
      const blueprintWith = (id: string, finish: string) =>
        registry.vehicleBlueprints.set(id, {
          ...hatchback,
          id,
          fittings: hatchback.fittings.map((fitting) => (fitting.id === 'bonnet' ? { ...fitting, finish } : fitting)),
        });
      blueprintWith('fixture_first_paint', first.id);
      blueprintWith('fixture_second_paint', second.id);
      try {
        const { inventory } = createRuntime();
        const add = (blueprint: string) => inventory.registerVehicle({ ...spec(`projection.${blueprint}`), blueprint });
        const [one, two] = [add('fixture_first_paint'), add('fixture_second_paint')];
        const { paint, glass, scene } = library();
        const original = paint.color.clone();
        const rendered = new VehicleMeshes(
          registry,
          { version: 1, part: () => scene.clone() } as never,
          scale.blockSize,
        );
        rendered.sync(inventory.vehicles);
        const meshes = (id: number, fittingId: string) => {
          const parts = projectVehicleParts(registry, id, inventory.vehicles.get(id)!, scale.blockSize).filter(
            (part) => part.model,
          );
          const holder = rendered.groupFor(id)!.children[parts.findIndex((part) => part.fittingId === fittingId)]!;
          return holder.children[0]!.children as Mesh<BoxGeometry, MeshStandardMaterial>[];
        };
        const [firstBody, firstGlass] = meshes(one, 'bonnet');
        const [secondBody, secondGlass] = meshes(two, 'bonnet');

        expect(firstBody!.material.color.getHex()).toBe(colourOf(first).getHex());
        expect(firstBody!.material.metalness).toBe(first.finish.metallic);
        expect(firstBody!.material.roughness).toBe(first.finish.roughness);
        expect(secondBody!.material.color.getHex()).toBe(colourOf(second).getHex());
        expect(firstGlass!.material.color.getHex()).toBe(glass.color.getHex());
        expect(secondGlass!.material.color.getHex()).toBe(glass.color.getHex());
        expect(meshes(one, 'shell')[0]!.material.color.equals(original)).toBe(true);
        expect(paint.color.equals(original)).toBe(true);
      } finally {
        registry.vehicleBlueprints.delete('fixture_first_paint');
        registry.vehicleBlueprints.delete('fixture_second_paint');
      }
    });

    describe('matches the authored-material path', () => {
      const surface = (material: MeshStandardMaterial) => ({
        type: material.type,
        color: material.color.getHex(),
        metalness: material.metalness,
        roughness: material.roughness,
        opacity: material.opacity,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
        sheen:
          material instanceof MeshPhysicalMaterial
            ? [material.sheen, material.sheenColor.getHex(), material.sheenRoughness]
            : undefined,
      });
      const authored = (id: string, materials: Readonly<Record<string, MaterialDef>>) => {
        const loaded = new MeshStandardMaterial();
        loaded.userData = { materialId: id, colourMultiplier: [1, 1, 1], paintable: true };
        const mesh = new Mesh(new BoxGeometry(), loaded);
        applyModelMaterials(mesh, materials);
        return mesh.material as MeshStandardMaterial;
      };
      const painted = (start: MeshStandardMaterial, { id: _id, ...finish }: typeof first) => {
        const mesh = new Mesh(new BoxGeometry(), start);
        const model = [...registry.models.keys()][0]!;
        applyItemStateLook(mesh, { model, state: { finish }, slots: [], hidden: [], key: '' }, registry);
        return mesh.material as MeshStandardMaterial;
      };
      const plainEntry: typeof first = {
        id: 'fixture-plain',
        colour: [0.6, 0.5, 0.4],
        finish: { metallic: 0.2, roughness: 0.6 },
      };
      const sheenEntry: typeof first = {
        id: 'fixture-sheen',
        colour: [0.2, 0.3, 0.4],
        finish: { metallic: 0.1, roughness: 0.7, opacity: 0.5, sheen: { colour: [0.9, 0.8, 0.7], roughness: 0.3 } },
      };
      const table: Record<string, MaterialDef> = { [plainEntry.id]: plainEntry, [sheenEntry.id]: sheenEntry };

      it('for every shipped finish, as its model material', () => {
        for (const finish of finishes) {
          const start = new MeshStandardMaterial();
          start.userData = { paintable: true };
          expect(surface(painted(start, finish)), finish.id).toEqual(surface(authored(finish.id, MATERIALS)));
        }
      });

      it.each([
        ['a plain surface takes a sheen', plainEntry, sheenEntry],
        ['a sheened surface loses it to a plain finish', sheenEntry, plainEntry],
      ])('when %s', (_, from, to) => {
        expect(surface(painted(authored(from.id, table), to))).toEqual(surface(authored(to.id, table)));
      });
    });

    it('draws wear over the paint on a loose part', () => {
      const model = [...registry.models.values()].find((entry) => {
        const presentation = entry.itemPresentation;
        const bands = presentation && registry.itemWear.get(presentation.wear)?.bands;
        return bands?.some((band) => (band.tints[presentation!.materials[0]!]?.mix ?? 0) > 0);
      })!;
      const { bands } = registry.itemWear.get(model.itemPresentation!.wear)!;
      const classId = model.itemPresentation!.materials[0]!;
      const wear = bands.findIndex((band) => (band.tints[classId]?.mix ?? 0) > 0);
      const tint = bands[wear]!.tints[classId]!;
      const { scene } = library();
      const { id: _id, ...finish } = first;
      applyItemStateLook(scene, { model: model.id, state: { finish, wear }, slots: [], hidden: [], key: '' }, registry);

      const [body] = scene.children as Mesh<BoxGeometry, MeshStandardMaterial>[];
      expect(body!.material.color.getHex()).toBe(colourOf(first).lerp(new Color(tint.color), tint.mix).getHex());
    });
  });

  it('rebuilds only the changed vehicle render group', () => {
    const { inventory } = createRuntime();
    const first = inventory.registerVehicle(spec('projection.first'));
    const second = inventory.registerVehicle(spec('projection.second'));
    const rendered = new VehicleMeshes(registry, models as never, scale.blockSize);
    rendered.sync(inventory.vehicles);
    const unchanged = rendered.groupFor(second);
    const build = inventory.vehicles.get(first)!;
    inventory.vehicles.replace(registry, first, {
      ...build,
      fittings: build.fittings.filter((fitting) => fitting.id !== absentLeaf()),
    });
    rendered.sync(inventory.vehicles);

    expect(rendered.groupFor(first)).not.toBeUndefined();
    expect(rendered.groupFor(second)).toBe(unchanged);
  });

  it("anchors a vehicle's sky samples against its own cells, which alone key its render", () => {
    const anchorsOf = (neighbour: boolean) => {
      const { inventory } = createRuntime();
      if (neighbour) {
        inventory.registerVehicle({ ...spec('projection.neighbour'), origin: [13, 7, -7] });
      }
      const id = inventory.registerVehicle(spec('projection.anchored'));
      const solid = { version: 1, part: () => new Group().add(new Mesh(new BoxGeometry(0.4, 0.4, 0.4))) };
      const rendered = new VehicleMeshes(registry, solid as never, scale.blockSize);
      rendered.sync(inventory.vehicles);
      const anchors: number[] = [];
      rendered.groupFor(id)!.traverse((object) => {
        if (object instanceof Mesh) {
          anchors.push(...(object.geometry.getAttribute(SKY_ANCHOR_ATTRIBUTE).array as Float32Array));
        }
      });
      return anchors;
    };

    const alone = anchorsOf(false);
    expect(alone.length).toBeGreaterThan(0);
    expect(anchorsOf(true)).toEqual(alone);
  });
});
