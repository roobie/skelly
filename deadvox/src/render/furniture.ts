import { BoxGeometry, type BufferGeometry, Color, Group, Mesh, MeshLambertMaterial } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type BlockEntities, type BlockEntity, panelFor } from '../core/blockEntities.ts';
import type { FurnitureDef } from '../core/schema.ts';
import { furnitureDetail } from './furnitureDetail.ts';
import { withHeightFog } from './heightFog.ts';
import { castsAndReceives } from './shadowFlags.ts';
import { workshopCar, workshopLift } from './workshopVehicle.ts';

/** Boxes are a touch smaller than their cells so their faces don't fight with walls. */
const INSET = 0.02;
const BODY_DOOR_SHADE = 0.62;
const BODY_DOOR_HANDLE_COLOR = '#c6b98e';
const BODY_DOOR_HANDLE_SIZE_M = { alongWidth: 0.1, acrossWidth: 0.06, height: 0.22 } as const;
const BODY_DOOR_HANDLE_EDGE_OFFSET_M = 0.14;

export class FurnitureMeshes {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly materials = new Map<string, MeshLambertMaterial>();
  private readonly shapeGeometries = new Map<string, BufferGeometry>();
  private readonly blockSize: number;
  private drawn = -1;

  constructor(blockSize: number) {
    this.blockSize = blockSize;
  }

  /** Rebuilds the meshes when furniture was added, opened or closed. */
  sync(entities: BlockEntities): void {
    if (entities.version === this.drawn) {
      return;
    }
    this.drawn = entities.version;
    this.group.clear();
    for (const entity of entities.all) {
      this.group.add(castsAndReceives(this.meshFor(entity, entities.defOf(entity))));
    }
  }

  private meshFor(entity: BlockEntity, def: FurnitureDef): Group | Mesh {
    const material = this.material(def.color);
    if (def.id === 'workshop_lift') {
      return workshopLift(entity, this.blockSize);
    }
    if (def.id === 'workshop_stripped_car') {
      return workshopCar(entity, this.blockSize);
    }
    if (def.door) {
      return this.door(entity, material, def);
    }
    if (def.readable && def.solid === false) {
      return this.wallBoard(entity, material);
    }
    if (def.appearance) {
      return this.shaped(entity, def, this.material('#ffffff', true));
    }
    if (def.shape) {
      return this.shaped(entity, def, material);
    }
    return this.box(entity, material);
  }

  private material(color: string, vertexColors = false): MeshLambertMaterial {
    const key = `${color}:${vertexColors}`;
    let material = this.materials.get(key);
    if (!material) {
      material = withHeightFog(new MeshLambertMaterial({ color, vertexColors }), 'furniture');
      this.materials.set(key, material);
    }
    return material;
  }

  private box(entity: BlockEntity, material: MeshLambertMaterial): Mesh {
    const s = this.blockSize;
    const [x, y, z] = entity.pos;
    const [w, h, d] = entity.size;
    const mesh = new Mesh(this.geometry, material);
    mesh.scale.set(w * s - INSET, h * s - INSET / 2, d * s - INSET);
    mesh.position.set((x + w / 2) * s, (y + h / 2) * s, (z + d / 2) * s);
    return mesh;
  }

  private shaped(entity: BlockEntity, def: FurnitureDef, material: MeshLambertMaterial): Mesh {
    let geometry = this.shapeGeometries.get(def.id);
    if (!geometry) {
      const [width, , depth] = def.size;
      const parts = (def.shape ?? []).map(({ position, size }) => {
        const [x, y, z] = position;
        const [w, h, d] = size;
        return new BoxGeometry(w, h, d).translate(x + w / 2 - width / 2, y + h / 2, z + d / 2 - depth / 2);
      });
      geometry = def.appearance ? furnitureDetail(def) : mergeGeometries(parts, false);
      for (const part of parts) {
        part.dispose();
      }
      if (!geometry) {
        throw new Error(`could not merge furniture shape "${def.id}"`);
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.shapeGeometries.set(def.id, geometry);
    }

    const [x, y, z] = entity.pos;
    const [width, , depth] = entity.size;
    const mesh = new Mesh(geometry, material);
    mesh.position.set((x + width / 2) * this.blockSize, y * this.blockSize, (z + depth / 2) * this.blockSize);
    mesh.rotation.y = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 }[entity.facing];
    mesh.scale.setScalar(this.blockSize);
    return mesh;
  }

  private wallBoard(entity: BlockEntity, material: MeshLambertMaterial): Mesh {
    const s = this.blockSize;
    const [x, y, z] = entity.pos;
    const [w, h, d] = entity.size;
    const alongX = entity.facing === 'n' || entity.facing === 's';
    const thickness = s * 0.16;
    const mesh = new Mesh(this.geometry, material);
    mesh.scale.set(alongX ? w * s - INSET : thickness, h * s - INSET / 2, alongX ? thickness : d * s - INSET);
    let boardX = (x + w / 2) * s;
    if (entity.facing === 'e') {
      boardX = x * s + thickness / 2;
    } else if (entity.facing === 'w') {
      boardX = (x + w) * s - thickness / 2;
    }
    let boardZ = (z + d / 2) * s;
    if (entity.facing === 'n') {
      boardZ = (z + d) * s - thickness / 2;
    } else if (entity.facing === 's') {
      boardZ = z * s + thickness / 2;
    }
    mesh.position.set(boardX, (y + h / 2) * s, boardZ);
    return mesh;
  }

  /** A panel across the doorway, hinged at its low end along the wall, or a hatch's panel. */
  private door(entity: BlockEntity, material: MeshLambertMaterial, body: FurnitureDef): Group {
    const box = panelFor(entity, body, this.blockSize);
    const isBodyDoor = body.shape !== undefined && body.door !== undefined;
    const panelMaterial = isBodyDoor
      ? this.material(`#${new Color(body.color).multiplyScalar(BODY_DOOR_SHADE).getHexString()}`)
      : material;
    const pivot = new Group();
    const panel = new Mesh(this.geometry, panelMaterial);
    pivot.position.set(...box.pivot);
    pivot.rotation.y = box.rotationY;
    panel.scale.set(...box.size);
    panel.position.set(...box.center);
    pivot.add(panel);
    if (isBodyDoor) {
      const alongX = entity.facing === 'n' || entity.facing === 's';
      const faceOutward = entity.facing === 'n' || entity.facing === 'w' ? -1 : 1;
      const handle = new Mesh(this.geometry, this.material(BODY_DOOR_HANDLE_COLOR));
      handle.scale.set(
        alongX ? BODY_DOOR_HANDLE_SIZE_M.alongWidth : BODY_DOOR_HANDLE_SIZE_M.acrossWidth,
        BODY_DOOR_HANDLE_SIZE_M.height,
        alongX ? BODY_DOOR_HANDLE_SIZE_M.acrossWidth : BODY_DOOR_HANDLE_SIZE_M.alongWidth,
      );
      const position = [...box.center] as [number, number, number];
      if (alongX) {
        position[0] += box.size[0] / 2 - BODY_DOOR_HANDLE_EDGE_OFFSET_M;
        position[2] += faceOutward * (box.size[2] / 2 + handle.scale.z / 2);
      } else {
        position[2] += box.size[2] / 2 - BODY_DOOR_HANDLE_EDGE_OFFSET_M;
        position[0] += faceOutward * (box.size[0] / 2 + handle.scale.x / 2);
      }
      handle.position.set(...position);
      pivot.add(handle);
    }
    if (!body.shape) {
      return pivot;
    }
    const assembly = new Group();
    assembly.add(this.shaped(entity, body, material));
    assembly.add(pivot);
    return assembly;
  }
}
