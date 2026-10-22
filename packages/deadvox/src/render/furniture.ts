import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineSegments,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type BlockEntities, type BlockEntity, isBodyDoor, panelFor, poseKey } from '../core/blockEntities.ts';
import type { Registry } from '../core/content.ts';
import { rotationOf } from '../core/orientation.ts';
import type { FurnitureDef } from '../core/schema.ts';
import type { ColumnReveal } from './columnReveal.ts';
import { furnitureDetail } from './furnitureDetail.ts';
import { withHeightFog } from './heightFog.ts';
import { castsAndReceives } from './shadowFlags.ts';
import { addSkyAnchors } from './skyAnchor.ts';
import { vehicleModel, workshopLift } from './workshopVehicle.ts';

/** Boxes are a touch smaller than their cells so their faces don't fight with walls. */
const INSET = 0.02;
const BODY_DOOR_SHADE = 0.62;
const BODY_DOOR_HANDLE_COLOR = '#c6b98e';
const BODY_DOOR_HANDLE_SIZE_M = { alongWidth: 0.1, acrossWidth: 0.06, height: 0.22 } as const;
const BODY_DOOR_HANDLE_EDGE_OFFSET_M = 0.14;

function markerEdges(): EdgesGeometry {
  const box = new BoxGeometry(1, 1, 1);
  const edges = new EdgesGeometry(box);
  box.dispose();
  const positions = edges.getAttribute('position');
  const normals = new Float32Array(positions.count * 3);
  for (let edge = 0; edge < positions.count; edge += 2) {
    // The midpoint's two nonzero axes bisect the adjacent faces, not the endpoint's three faces.
    const x = positions.getX(edge) + positions.getX(edge + 1);
    const y = positions.getY(edge) + positions.getY(edge + 1);
    const z = positions.getZ(edge) + positions.getZ(edge + 1);
    const length = Math.hypot(x, y, z);
    normals.set([x / length, y / length, z / length], edge * 3);
    normals.set([x / length, y / length, z / length], (edge + 1) * 3);
  }
  edges.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  return edges;
}

export class FurnitureMeshes {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly materials = new Map<string, MeshLambertMaterial>();
  private readonly anchoredMaterials = new Map<MeshLambertMaterial, MeshLambertMaterial>();
  private readonly shapeGeometries = new Map<string, BufferGeometry>();
  private readonly blockSize: number;
  private readonly marker = new LineSegments(
    markerEdges(),
    withHeightFog(new MeshLambertMaterial({ color: '#ffe36e', depthTest: true }), 'furniture'),
  );
  private registry: Registry | undefined;
  private markedUid: string | undefined;
  private markedOpen: boolean | undefined;
  private drawn = -1;
  private drawnReveal = -1;
  private readonly reveal: ColumnReveal | undefined;
  private pieces = new Map<BlockEntity, { pose: string; mesh: Group | Mesh }>();

  constructor(blockSize: number, reveal?: ColumnReveal) {
    this.blockSize = blockSize;
    this.reveal = reveal;
    this.marker.visible = false;
    this.marker.receiveShadow = true;
    this.group.add(this.marker);
  }

  /** Marks the selected furniture using its visible panel pose when it has a door. */
  mark(entity: BlockEntity | undefined, definition?: FurnitureDef): void {
    if (entity && this.reveal && !this.reveal.isRevealed(entity.pos[0], entity.pos[2])) {
      this.mark(undefined);
      return;
    }
    if (entity && `furniture:${entity.uid}` === this.markedUid && entity.open === this.markedOpen) {
      return;
    }
    this.markedUid = entity ? `furniture:${entity.uid}` : undefined;
    this.markedOpen = entity?.open;
    if (!entity) {
      this.marker.visible = false;
      return;
    }
    const s = this.blockSize;
    if (definition?.door) {
      const panel = panelFor(entity, definition, s);
      const sin = Math.sin(panel.rotationY);
      const cos = Math.cos(panel.rotationY);
      const centerX = panel.center[0] * cos + panel.center[2] * sin;
      const centerZ = -panel.center[0] * sin + panel.center[2] * cos;
      const width = Math.abs(panel.size[0] * cos) + Math.abs(panel.size[2] * sin);
      const depth = Math.abs(panel.size[0] * sin) + Math.abs(panel.size[2] * cos);
      this.marker.scale.set(width + 0.035, panel.size[1] + 0.035, depth + 0.035);
      this.marker.position.set(panel.pivot[0] + centerX, panel.pivot[1] + panel.center[1], panel.pivot[2] + centerZ);
    } else {
      const [x, y, z] = entity.pos;
      const [w, h, d] = entity.size;
      this.marker.scale.set(w * s + 0.035, h * s + 0.035, d * s + 0.035);
      this.marker.position.set((x + w / 2) * s, (y + h / 2) * s, (z + d / 2) * s);
    }
    this.marker.visible = true;
  }

  /** Marks another interaction owner using its display or pick bounds. */
  markBounds(
    uid: string | undefined,
    position: readonly [number, number, number],
    size: readonly [number, number, number],
  ): void {
    this.markedUid = uid;
    this.markedOpen = undefined;
    if (!uid || (this.reveal && !this.reveal.isRevealed(position[0] / this.blockSize, position[2] / this.blockSize))) {
      this.marker.visible = false;
      return;
    }
    this.marker.scale.set(size[0] + 0.035, size[1] + 0.035, size[2] + 0.035);
    this.marker.position.set(...position);
    this.marker.visible = true;
  }

  /** Rebuilds the meshes of pieces added, moved, turned, opened or closed, and keeps the rest. */
  sync(entities: BlockEntities): void {
    const revealVersion = this.reveal?.revealVersion ?? 0;
    if (entities.standing === this.drawn && revealVersion === this.drawnReveal) {
      return;
    }
    this.registry = entities.registry;
    this.drawn = entities.standing;
    this.drawnReveal = revealVersion;
    const pieces = new Map<BlockEntity, { pose: string; mesh: Group | Mesh }>();
    this.group.clear();
    for (const entity of entities.all) {
      const pose = poseKey(entity);
      const kept = this.pieces.get(entity);
      const piece =
        kept?.pose === pose ? kept : { pose, mesh: castsAndReceives(this.meshFor(entity, entities.defOf(entity))) };
      piece.mesh.visible = this.reveal?.isRevealed(entity.pos[0], entity.pos[2]) ?? true;
      pieces.set(entity, piece);
      this.group.add(piece.mesh);
    }
    this.pieces = pieces;
    this.group.add(this.marker);
  }

  /** A piece built as it would stand, for drawing it away from the world; it shares this owner's geometry and materials. */
  pieceMesh(entity: BlockEntity, def: FurnitureDef): Group | Mesh {
    return this.meshFor(entity, def);
  }

  private meshFor(entity: BlockEntity, def: FurnitureDef): Group | Mesh {
    const material = this.material(def.color);
    if (def.id === 'workshop_lift') {
      return workshopLift(entity, this.blockSize);
    }
    if (def.vehicle) {
      return vehicleModel(entity, def.vehicle, def.size[1], this.blockSize);
    }
    if (def.door) {
      return this.door(entity, material, def);
    }
    if (def.appearance || def.shape?.some((box) => box.color)) {
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

  /** `material` for shaped geometry, which carries sky anchors (see `addSkyAnchors`). */
  private anchored(material: MeshLambertMaterial): MeshLambertMaterial {
    let result = this.anchoredMaterials.get(material);
    if (!result) {
      result = withHeightFog(
        new MeshLambertMaterial({ color: material.color, vertexColors: material.vertexColors }),
        'furniture',
      );
      result.defines = { SKY_ANCHOR: '' };
      this.anchoredMaterials.set(material, result);
    }
    return result;
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
      const tinted = def.shape?.some((box) => box.color) ?? false;
      const parts = (def.shape ?? []).map(({ position, size, color }) => {
        const [x, y, z] = position;
        const [w, h, d] = size;
        const part = new BoxGeometry(w, h, d).translate(x + w / 2 - width / 2, y + h / 2, z + d / 2 - depth / 2);
        if (tinted) {
          const paint = new Color(color ?? def.color);
          const { count } = part.getAttribute('position');
          part.setAttribute(
            'color',
            new Float32BufferAttribute(Array.from({ length: count }, () => [paint.r, paint.g, paint.b]).flat(), 3),
          );
        }
        return part;
      });
      geometry = def.appearance ? furnitureDetail(def) : mergeGeometries(parts, false);
      for (const part of parts) {
        part.dispose();
      }
      if (!geometry) {
        throw new Error(`could not merge furniture shape "${def.id}"`);
      }
      addSkyAnchors(geometry, def.size);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      this.shapeGeometries.set(def.id, geometry);
    }

    const [x, y, z] = entity.pos;
    const [width, height, depth] = entity.size;
    const [right, up, back] = rotationOf(entity).map((axis) => new Vector3(...axis));
    const piece = new Mesh(geometry, this.anchored(material));
    piece.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right!, up!, back!));
    // The model stands on its own bottom centre, so its middle sits half its own height along its up axis.
    piece.position
      .set(x + width / 2, y + height / 2, z + depth / 2)
      .addScaledVector(up!, -def.size[1] / 2)
      .multiplyScalar(this.blockSize);
    piece.scale.setScalar(this.blockSize);
    return piece;
  }

  /** `plain` moved toward its door material's broken tint once the leaf is broken; no look authored leaves it. */
  private brokenMaterial(entity: BlockEntity, plain: MeshLambertMaterial, body: FurnitureDef): MeshLambertMaterial {
    const look = entity.broken ? this.registry?.doorMaterials.get(body.door!.material)?.broken : undefined;
    if (!look) {
      return plain;
    }
    return this.material(`#${plain.color.clone().lerp(new Color(look.tint), look.strength).getHexString()}`);
  }

  /** A panel across the doorway, hinged at its low end along the wall, or a hatch's panel. */
  private door(entity: BlockEntity, plain: MeshLambertMaterial, body: FurnitureDef): Group {
    const box = panelFor(entity, body, this.blockSize);
    const bodyDoor = isBodyDoor(body);
    const material = this.brokenMaterial(entity, plain, body);
    const panelMaterial = bodyDoor
      ? this.material(`#${new Color(material.color).multiplyScalar(BODY_DOOR_SHADE).getHexString()}`)
      : material;
    const pivot = new Group();
    const panel = new Mesh(this.geometry, panelMaterial);
    pivot.position.set(...box.pivot);
    pivot.rotation.y = box.rotationY;
    panel.scale.set(...box.size);
    panel.position.set(...box.center);
    pivot.add(panel);
    if (bodyDoor) {
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
    const shaped = this.shaped(entity, body, material);
    if (!bodyDoor) {
      // A doorway leaf's planks or bars hang on the hinge, so they swing open with it.
      shaped.position.sub(pivot.position);
      pivot.add(shaped);
      return pivot;
    }
    const assembly = new Group();
    assembly.add(shaped);
    assembly.add(pivot);
    return assembly;
  }
}
