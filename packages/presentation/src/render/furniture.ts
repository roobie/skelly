import type { FurnitureDef } from '@skelly/engine/content';
import type { ColumnReveal } from '@skelly/engine/mesh';
import { BLUEPRINTS } from '@skelly/engine/vehicles';
import {
  type BlockEntities,
  type BlockEntity,
  CHUNK,
  type DoorPanelBox,
  doorBarBox,
  type Facing,
  isBodyDoor,
  type PoweredLight,
  panelFor,
  poseKey,
  rotationOf,
  toChunk,
  type Vec3,
} from '@skelly/engine/world';
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineSegments,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { doorDetail } from './doorDetail.ts';
import { furnitureDetail } from './furnitureDetail.ts';
import { withHeightFog } from './heightFog.ts';
import { castsAndReceives } from './shadowFlags.ts';
import { addSkyAnchors } from './skyAnchor.ts';
import { freezeMatrices } from './staticMatrices.ts';
import { VehicleShapes } from './vehicleShapes.ts';
import { type ContentVehicleView, vehicleModel, workshopLift } from './workshopVehicle.ts';

/** Boxes are a touch smaller than their cells so their faces don't fight with walls. */
const INSET = 0.02;
const BODY_DOOR_SHADE = 0.62;
const BODY_DOOR_HANDLE_COLOR = '#c6b98e';
const BODY_DOOR_HANDLE_SIZE_M = { alongWidth: 0.1, acrossWidth: 0.06, height: 0.22 } as const;
const BODY_DOOR_HANDLE_EDGE_OFFSET_M = 0.14;
const HATCH_FROM_HINGE: Record<Facing, Vec3> = { n: [0, 0, 1], s: [0, 0, -1], e: [-1, 0, 0], w: [1, 0, 0] };

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

interface Piece {
  readonly pose: string;
  /** The model library version its mesh was staged against; a content vehicle look restages when it rises. */
  readonly models?: number | undefined;
  /** A batched piece's mesh is never drawn; it holds the geometry, material and transform its batch instances. */
  readonly mesh: Group | Mesh;
  /** The batch a piece that never moves between syncs is drawn in. */
  readonly batch?: string;
  /** The column its lowest corner stands in, which decides whether it is revealed. */
  readonly column: RevealColumn;
}

/** The drawn pieces whose lowest corner stands in one chunk column, which `ColumnReveal` reveals as a whole. */
interface RevealColumn {
  readonly key: string;
  /** The column's lowest corner, in blocks. */
  readonly x: number;
  readonly z: number;
  revealed: boolean;
  readonly pieces: Set<BlockEntity>;
}

interface Batch {
  readonly members: readonly Piece[];
  readonly mesh: InstancedMesh;
}

export class FurnitureMeshes {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly materials = new Map<string, MeshLambertMaterial>();
  private readonly anchoredMaterials = new Map<MeshLambertMaterial, MeshLambertMaterial>();
  private readonly shapeGeometries = new Map<string, BufferGeometry>();
  private readonly doorGeometries = new Map<string, BufferGeometry>();
  private readonly blockSize: number;
  private readonly vehicles: VehicleShapes;
  private readonly marker = new LineSegments(
    markerEdges(),
    withHeightFog(new MeshLambertMaterial({ color: '#ffe36e', depthTest: true }), 'furniture'),
  );
  private entities: BlockEntities | undefined;
  private markedUid: string | undefined;
  private markedOpen: boolean | undefined;
  private drawn = -1;
  private glowing = new Set<BlockEntity>();
  private drawnReveal = -1;
  private readonly reveal: ColumnReveal | undefined;
  private readonly sectorBlocks: number | undefined;
  private readonly content: ContentVehicleView | undefined;
  /** The model library version whose parts the content vehicle looks were staged against. */
  private drawnModels = -1;
  private readonly pieces = new Map<BlockEntity, Piece>();
  private readonly columns = new Map<string, RevealColumn>();
  /** Every drawn piece of each batch, revealed or not. */
  private readonly batched = new Map<string, Set<BlockEntity>>();
  private readonly batches = new Map<string, Batch>();

  /**
   * `vehicles` meshes vehicle displays; with a worker behind it a vehicle appears when its mesh arrives.
   * `sectorChunks` is the side of the square area one batch of standing pieces covers; without it one batch covers
   * the world.
   */
  constructor(
    blockSize: number,
    reveal?: ColumnReveal,
    vehicles = new VehicleShapes(),
    { sectorChunks, content }: { sectorChunks?: number; content?: ContentVehicleView } = {},
  ) {
    this.blockSize = blockSize;
    this.vehicles = vehicles;
    this.reveal = reveal;
    this.sectorBlocks = sectorChunks === undefined ? undefined : sectorChunks * CHUNK;
    this.content = content;
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

  /**
   * Rebuilds the meshes of pieces added, moved, turned, opened or closed, and keeps the rest. Pieces that never move
   * between syncs are drawn as one instanced batch per geometry, material and sector, so a frame draws, culls and
   * updates a batch rather than each piece; a batch whose revealed members did not change is kept. Every explored
   * piece stays in memory, so a sync looks only at the pieces `standingChangesSince` names and the columns whose
   * reveal changed, and draws what looking at every piece would.
   */
  sync(entities: BlockEntities, poweredLights: readonly PoweredLight[] = []): void {
    const glowChanged = this.updateGlow(entities, poweredLights);
    const revealVersion = this.reveal?.revealVersion ?? 0;
    const modelsVersion = this.content?.models.version ?? 0;
    const modelsArrived = modelsVersion !== this.drawnModels;
    if (
      entities === this.entities &&
      entities.standing === this.drawn &&
      revealVersion === this.drawnReveal &&
      !modelsArrived &&
      glowChanged.size === 0
    ) {
      return;
    }
    const since = entities === this.entities ? entities.standingChangesSince(this.drawn) : undefined;
    this.drawnModels = modelsVersion;
    this.entities = entities;
    this.drawn = entities.standing;
    const redraw = new Set<string>();
    const changed = new Set(since === undefined ? [...this.pieces.keys(), ...entities.all] : since);
    for (const entity of glowChanged) {
      changed.add(entity);
    }
    if (modelsArrived) {
      for (const [entity] of [...this.pieces].filter(([, piece]) => piece.models !== undefined)) {
        changed.add(entity);
      }
    }
    for (const entity of changed) {
      this.restage(entity, entities, modelsVersion, redraw);
    }
    if (revealVersion !== this.drawnReveal) {
      this.drawnReveal = revealVersion;
      this.recheckReveal(redraw);
    }
    for (const key of redraw) {
      this.redrawBatch(key, entities);
    }
    if (this.group.children.at(-1) !== this.marker) {
      this.group.add(this.marker);
    }
  }

  private updateGlow(entities: BlockEntities, poweredLights: readonly PoweredLight[]): Set<BlockEntity> {
    const glowing = new Set<BlockEntity>();
    for (const { body } of poweredLights) {
      const entity = body && entities.atOrigin(body.min);
      if (
        entity &&
        body?.min.every((value, axis) => entity.pos[axis] === value) &&
        entities.defOf(entity).power?.light?.emissive
      ) {
        glowing.add(entity);
      }
    }
    const changed = new Set(
      [...this.glowing, ...glowing].filter((entity) => this.glowing.has(entity) !== glowing.has(entity)),
    );
    this.glowing = glowing;
    return changed;
  }

  /** Keeps an entity's piece while its pose is unchanged and its mesh is current, else rebuilds it, or drops it once the entity stops standing. */
  private restage(entity: BlockEntity, entities: BlockEntities, modelsVersion: number, redraw: Set<string>): void {
    const pose = entities.stands(entity)
      ? `${poseKey(entity, entities.wearOf(entity))}:${this.glowing.has(entity)}`
      : undefined;
    const kept = this.pieces.get(entity);
    if (kept !== undefined && kept.pose === pose && (kept.models === undefined || kept.models === modelsVersion)) {
      return;
    }
    if (kept) {
      this.unstage(entity, kept, redraw);
    }
    if (pose !== undefined) {
      const def = entities.defOf(entity);
      const models = def.vehicle && BLUEPRINTS[def.vehicle.blueprint] === undefined ? modelsVersion : undefined;
      this.stage(entity, { ...this.piece(entity, def, pose), models }, redraw);
    }
  }

  private stage(entity: BlockEntity, piece: Piece, redraw: Set<string>): void {
    this.pieces.set(entity, piece);
    piece.column.pieces.add(entity);
    if (piece.batch === undefined) {
      piece.mesh.visible = piece.column.revealed;
      // A staged piece stands where it was built until a change restages it as a fresh mesh, so its
      // subtree never moves in place.
      freezeMatrices(piece.mesh);
      this.group.add(piece.mesh);
      return;
    }
    let members = this.batched.get(piece.batch);
    if (!members) {
      members = new Set();
      this.batched.set(piece.batch, members);
    }
    members.add(entity);
    redraw.add(piece.batch);
  }

  private unstage(entity: BlockEntity, piece: Piece, redraw: Set<string>): void {
    this.pieces.delete(entity);
    piece.column.pieces.delete(entity);
    if (piece.column.pieces.size === 0) {
      this.columns.delete(piece.column.key);
    }
    if (piece.batch === undefined) {
      this.group.remove(piece.mesh);
      return;
    }
    const members = this.batched.get(piece.batch)!;
    members.delete(entity);
    if (members.size === 0) {
      this.batched.delete(piece.batch);
    }
    redraw.add(piece.batch);
  }

  /** Shows or hides the pieces of each column whose reveal changed. */
  private recheckReveal(redraw: Set<string>): void {
    for (const column of this.columns.values()) {
      const revealed = this.revealedAt(column.x, column.z);
      if (revealed === column.revealed) {
        continue;
      }
      column.revealed = revealed;
      for (const entity of column.pieces) {
        const piece = this.pieces.get(entity)!;
        if (piece.batch === undefined) {
          piece.mesh.visible = revealed;
        } else {
          redraw.add(piece.batch);
        }
      }
    }
  }

  /**
   * Draws a batch's revealed pieces in the order `all` lists them, keeping the drawn batch when they are the same and
   * disposing it otherwise.
   */
  private redrawBatch(key: string, entities: BlockEntities): void {
    const revealed = [...(this.batched.get(key) ?? [])].filter((entity) => this.pieces.get(entity)!.column.revealed);
    const members = entities.listed(revealed).map((entity) => this.pieces.get(entity)!);
    const kept = this.batches.get(key);
    if (kept && sameMembers(kept.members, members)) {
      return;
    }
    if (kept) {
      this.group.remove(kept.mesh);
      kept.mesh.dispose();
      this.batches.delete(key);
    }
    if (members.length > 0) {
      const batch = { members, mesh: batchMesh(members) };
      this.batches.set(key, batch);
      this.group.add(batch.mesh);
    }
  }

  private piece(entity: BlockEntity, def: FurnitureDef, pose: string): Omit<Piece, 'models'> {
    const column = this.columnOf(entity);
    if (!standsStill(def)) {
      return { pose, mesh: castsAndReceives(this.meshFor(entity, def)), column };
    }
    const mesh = this.standingMesh(entity, def);
    mesh.updateMatrix();
    const sector = this.sectorBlocks
      ? `${Math.floor(entity.pos[0] / this.sectorBlocks)}:${Math.floor(entity.pos[2] / this.sectorBlocks)}`
      : '';
    return { pose, mesh, batch: `${mesh.geometry.uuid}:${mesh.material.uuid}:${sector}`, column };
  }

  private columnOf(entity: BlockEntity): RevealColumn {
    const x = toChunk(entity.pos[0]) * CHUNK;
    const z = toChunk(entity.pos[2]) * CHUNK;
    const key = `${x},${z}`;
    let column = this.columns.get(key);
    if (!column) {
      column = { key, x, z, revealed: this.revealedAt(x, z), pieces: new Set() };
      this.columns.set(key, column);
    }
    return column;
  }

  private revealedAt(x: number, z: number): boolean {
    return this.reveal?.isRevealed(x, z) ?? true;
  }

  /**
   * Frees the batches, then each geometry and material this owner made, once. Pieces from `pieceMesh` borrow those,
   * so they go with it; vehicle and lift parts belong to their modules (workshopVehicle.ts) and stay.
   */
  dispose(): void {
    for (const { mesh } of this.batches.values()) {
      mesh.dispose();
    }
    this.batches.clear();
    this.batched.clear();
    this.pieces.clear();
    this.glowing.clear();
    this.columns.clear();
    this.group.clear();
    const geometries = new Set<BufferGeometry>([
      this.geometry,
      this.marker.geometry,
      ...this.shapeGeometries.values(),
      ...this.doorGeometries.values(),
    ]);
    const materials = new Set<MeshLambertMaterial>([
      this.marker.material,
      ...this.materials.values(),
      ...this.anchoredMaterials.values(),
    ]);
    for (const geometry of geometries) {
      geometry.dispose();
    }
    for (const material of materials) {
      material.dispose();
    }
    this.shapeGeometries.clear();
    this.doorGeometries.clear();
    this.materials.clear();
    this.anchoredMaterials.clear();
  }

  /** A piece built as it would stand, for drawing it away from the world; it shares this owner's geometry and materials. */
  pieceMesh(entity: BlockEntity, def: FurnitureDef): Group | Mesh {
    return this.meshFor(entity, def, false);
  }

  /** `wait` lets a vehicle's mesh arrive later; a caller that measures the piece at once passes false. */
  private meshFor(entity: BlockEntity, def: FurnitureDef, wait = true): Group | Mesh {
    const material = this.material(def.color);
    if (def.id === 'workshop_lift') {
      return this.bodyGlowMesh(entity, def, workshopLift(entity, this.blockSize));
    }
    if (def.vehicle) {
      return vehicleModel(entity, def.vehicle, def.size[1], {
        blockSize: this.blockSize,
        shapes: this.vehicles,
        wait,
        content: this.content,
      });
    }
    if (def.corpse) {
      return new Group(); // Drawn as its figure (`src/render/corpseFigures.ts`, `CorpseFigures`).
    }
    if (def.door) {
      return this.bodyGlowMesh(entity, def, this.door(entity, material, def));
    }
    return this.standingMesh(entity, def);
  }

  /** The one mesh of a piece that `standsStill`. */
  private standingMesh(entity: BlockEntity, def: FurnitureDef): Mesh<BufferGeometry, MeshLambertMaterial> {
    const vertexColors = Boolean(def.appearance || def.shape?.some((box) => box.color));
    const base = this.damageLook(entity, this.material(vertexColors ? '#ffffff' : def.color, vertexColors), def);
    const material = this.bodyGlow(entity, def, base);
    if (def.appearance || def.shape) {
      return this.shaped(entity, def, material);
    }
    return this.box(entity, material);
  }

  private bodyGlowMesh(entity: BlockEntity, def: FurnitureDef, mesh: Group | Mesh): Group | Mesh {
    mesh.traverse((part) => {
      if (part instanceof Mesh && part.material instanceof MeshLambertMaterial) {
        part.material = this.bodyGlow(entity, def, part.material);
      }
    });
    return mesh;
  }

  private bodyGlow(entity: BlockEntity, def: FurnitureDef, base: MeshLambertMaterial): MeshLambertMaterial {
    const light = def.power?.light;
    if (!(this.glowing.has(entity) && light?.emissive)) {
      return base;
    }
    const key = `${base.uuid}:${light.color}:${light.emissive}`;
    let material = this.materials.get(key);
    if (!material) {
      material = withHeightFog(
        new MeshLambertMaterial({
          color: base.color,
          vertexColors: base.vertexColors,
          emissive: light.color,
          emissiveIntensity: light.emissive,
        }),
        'furniture',
      );
      material.defines = { ...base.defines };
      this.materials.set(key, material);
    }
    return material;
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
        new MeshLambertMaterial({
          color: material.color,
          vertexColors: material.vertexColors,
          emissive: material.emissive,
          emissiveIntensity: material.emissiveIntensity,
        }),
        'furniture',
      );
      result.defines = { SKY_ANCHOR: '' };
      this.anchoredMaterials.set(material, result);
    }
    return result;
  }

  private box(entity: BlockEntity, material: MeshLambertMaterial): Mesh<BufferGeometry, MeshLambertMaterial> {
    const s = this.blockSize;
    const [x, y, z] = entity.pos;
    const [w, h, d] = entity.size;
    const mesh = new Mesh(this.geometry, material);
    mesh.scale.set(w * s - INSET, h * s - INSET / 2, d * s - INSET);
    mesh.position.set((x + w / 2) * s, (y + h / 2) * s, (z + d / 2) * s);
    return mesh;
  }

  private shaped(
    entity: BlockEntity,
    def: FurnitureDef,
    material: MeshLambertMaterial,
  ): Mesh<BufferGeometry, MeshLambertMaterial> {
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

  /**
   * `plain` moved toward its material's broken tint once a leaf is broken, or toward the damage look the piece has
   * reached before that; no look authored leaves it.
   */
  private damageLook(entity: BlockEntity, plain: MeshLambertMaterial, body: FurnitureDef): MeshLambertMaterial {
    const material = this.entities?.registry.furnitureMaterials.get(body.material);
    const wear = this.entities?.wearOf(entity) ?? 0;
    const worn = wear > 0 ? material?.damaged?.[wear - 1] : undefined;
    const look = entity.broken ? material?.broken : worn;
    if (!look) {
      return plain;
    }
    return this.material(
      `#${plain.color.clone().lerp(new Color(look.tint), look.strength).getHexString()}`,
      plain.vertexColors,
    );
  }

  /** A panel across the doorway, hinged at its low end along the wall, or a hatch's panel. */
  private door(entity: BlockEntity, plain: MeshLambertMaterial, body: FurnitureDef): Group {
    const box = panelFor(entity, body, this.blockSize);
    const bodyDoor = isBodyDoor(body);
    const material = this.damageLook(entity, plain, body);
    const panelMaterial = bodyDoor
      ? this.material(`#${new Color(material.color).multiplyScalar(BODY_DOOR_SHADE).getHexString()}`)
      : material;
    const pivot = new Group();
    pivot.position.set(...box.pivot);
    pivot.rotation.y = box.rotationY;
    if (body.door?.detail) {
      pivot.add(this.detailedLeaf(entity, body, box));
    } else {
      const panel = new Mesh(this.geometry, panelMaterial);
      panel.scale.set(...box.size);
      panel.position.set(...box.center);
      pivot.add(panel);
    }
    this.addDoorBar(pivot, entity, box);
    if (bodyDoor) {
      pivot.add(this.bodyDoorHandle(entity, box));
    }
    if (!body.shape) {
      return pivot;
    }
    const shaped = this.shaped(
      entity,
      body,
      body.shape.some((part) => part.color) ? this.damageLook(entity, this.material('#ffffff', true), body) : material,
    );
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

  private addDoorBar(pivot: Group, entity: BlockEntity, box: ReturnType<typeof panelFor>): void {
    const look = entity.bar && this.entities?.registry.items.get(entity.bar.item)?.doorBar?.look;
    if (!look) {
      return;
    }
    const bar = new Mesh(this.geometry, this.material(look.color));
    const { center, size } = doorBarBox(entity, box, look.thickness);
    bar.scale.set(...size);
    bar.position.set(...center);
    pivot.add(bar);
  }

  private bodyDoorHandle(entity: BlockEntity, box: DoorPanelBox): Mesh {
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
    return handle;
  }

  /** A leaf or hatch drawn with its definition's detail in place of the plain panel, in the same one draw. */
  private detailedLeaf(entity: BlockEntity, body: FurnitureDef, box: DoorPanelBox): Mesh {
    const hatch = body.door?.hatch === true;
    const [fromHinge, alongHinge] = leafAxes(entity, hatch);
    const through = new Vector3().crossVectors(fromHinge, alongHinge);
    const size = new Vector3(...box.size);
    const extents = [fromHinge, alongHinge, through].map((axis) => Math.abs(size.dot(axis))) as Vec3;
    const key = `${body.id}|${extents.map((extent) => extent.toFixed(4))}`;
    let geometry = this.doorGeometries.get(key);
    if (!geometry) {
      geometry = doorDetail(body, extents);
      this.doorGeometries.set(key, geometry);
    }
    const leaf = new Mesh(geometry, this.damageLook(entity, this.material('#ffffff', true), body));
    leaf.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(fromHinge, alongHinge, through));
    leaf.position.set(...box.center);
    if (hatch && !entity.open) {
      // A shut hatch sits down in its frame, so its ring and hinges stay inside its cells.
      leaf.position.y -= geometry.boundingBox!.max.z - extents[2] / 2;
    }
    return leaf;
  }
}

/** Doors swing, vehicles and the lift move their parts, and corpses are drawn elsewhere; the rest is one mesh. */
const standsStill = (def: FurnitureDef): boolean =>
  def.id !== 'workshop_lift' && !def.vehicle && !def.corpse && !def.door;

const sameMembers = (kept: readonly Piece[], list: readonly Piece[]): boolean =>
  kept.length === list.length && kept.every((piece, index) => piece === list[index]);

/** One instanced draw of `members`, which share a geometry and material, each at its own mesh's transform. */
const batchMesh = (members: readonly Piece[]): InstancedMesh => {
  const { geometry, material } = members[0]!.mesh as Mesh;
  const batch = castsAndReceives(new InstancedMesh(geometry, material, members.length));
  for (const [index, piece] of members.entries()) {
    batch.setMatrixAt(index, piece.mesh.matrix);
  }
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  freezeMatrices(batch);
  return batch;
};

/** Unit axes of a leaf's panel: away from its hinge edge, and along that edge. */
function leafAxes(entity: BlockEntity, hatch: boolean): [Vector3, Vector3] {
  const northSouth = entity.facing === 'n' || entity.facing === 's';
  const across = northSouth ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
  if (!hatch) {
    // A doorway leaf hangs on its low end, so it reaches away from the hinge along the doorway.
    return [across, new Vector3(0, 1, 0)];
  }
  // A hatch's hinge edge is on its facing side; open, it stands up on that edge.
  return [entity.open ? new Vector3(0, 1, 0) : new Vector3(...HATCH_FROM_HINGE[entity.facing]), across];
}
