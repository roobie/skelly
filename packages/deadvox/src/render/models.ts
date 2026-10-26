// Item models (`DESIGN.md`, "Piles and item models"): glTF binaries in the base pack, loaded once
// with three.js's GLTFLoader. Each is prepared twice: on the ground as it rests, centred
// over the origin, for piles; and held at its grip in the data-selected pose.
// Until a model has loaded, or if it can't, its items show as if they had none.

import { MATERIALS } from '@skelly/thing-core/materials';
import {
  Bone,
  Box3,
  type BufferGeometry,
  Group,
  type Material,
  MathUtils,
  Matrix4,
  Mesh,
  Object3D,
  SkinnedMesh,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { ModelDef, Registry } from '../core/content.ts';
import { type ActionPartPath, actionPartPaths, cloneHeldModel, type HeldModel, namedNodes } from './firearmModel.ts';
import type { ItemLook, ItemLookSlot } from './itemLook.ts';
import { applyModelMaterials } from './modelMaterials.ts';

/** The base pack's model files, by their path within the pack. */
const PACK_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../content/base/assets/**/*.glb', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.replace('../content/base/', ''), url]),
);

export interface GroundModelPart {
  readonly geometry: BufferGeometry;
  readonly material: Material | Material[];
  /** Transform from the prepared ground-model root to this mesh. */
  readonly matrix: Matrix4;
}

interface Prepared {
  ground: Object3D;
  groundParts: readonly GroundModelPart[];
  held: Object3D;
  /** The file's scene in its own frame, for drawing this model as another model's part. */
  scene: Object3D;
}

/** A slot in a composed model: its frame, and the fitted part's model inside it while one is fitted. */
export interface ComposedSlot {
  readonly frame: Object3D;
  readonly model?: Object3D;
  readonly modelId?: string;
}

export interface ComposedHeld extends HeldModel {
  readonly slots: Partial<Record<string, ComposedSlot>>;
}

/** Hides the baked geometry of item-owned slots: an item's look draws what is really fitted there instead. */
const hideSlotNodes = (def: ModelDef, scene: Object3D, parser: Parameters<typeof namedNodes>[1]): void => {
  const names = [
    ...Object.values(def.gun?.slots ?? {}).flatMap((slot) => (slot ? [slot.node] : [])),
    ...(def.gun?.attachments ?? []).map(({ node }) => node),
  ];
  for (const node of namedNodes(scene, parser, names)) {
    node.visible = false;
  }
};

/** The frame a slot's `at` and `turn` place a part in: the base model's file frame. */
export const fittedPartFrame = (slot: ItemLookSlot): Group => {
  const frame = new Group();
  frame.position.set(...slot.at);
  if (slot.direction && slot.up) {
    if (!slot.mountFrame) {
      throw new Error(`Fitted model ${slot.model ?? slot.slot} has no exported mount frame`);
    }
    const sourceNormal = new Vector3(...slot.mountFrame.normal).normalize();
    const sourceUp = new Vector3(...slot.mountFrame.up).normalize();
    const sourceSide = sourceNormal.clone().cross(sourceUp).normalize();
    const targetNormal = new Vector3(...slot.direction).negate().normalize();
    const targetUp = new Vector3(...slot.up).normalize();
    const targetSide = targetNormal.clone().cross(targetUp).normalize();
    const sourceFrame = new Matrix4().makeBasis(sourceNormal, sourceUp, sourceSide);
    const targetFrame = new Matrix4().makeBasis(targetNormal, targetUp, targetSide);
    frame.quaternion.setFromRotationMatrix(targetFrame.multiply(sourceFrame.invert()));
  } else if (slot.turn) {
    const [tx, ty, tz] = slot.turn;
    frame.rotation.set(MathUtils.degToRad(tx), MathUtils.degToRad(ty), MathUtils.degToRad(tz), 'XYZ');
  }
  return frame;
};

/** The empty object marking where a held light shines from. */
export const LENS = 'lens';

/**
 * Wraps a copy of the model so the wrapper's origin is at `origin` in the model's
 * metres, with a `LENS` marker at `lens` if given.
 */
const around = (scene: Object3D, origin: Vector3, lens?: Vector3): Group => {
  const copy = scene.clone();
  const offset = new Group();
  offset.position.copy(origin).negate();
  offset.add(copy);
  if (lens) {
    const marker = new Object3D();
    marker.name = LENS;
    marker.position.copy(lens);
    offset.add(marker);
  }
  return new Group().add(offset);
};

/** Bounds of what is drawn: hidden slot geometry doesn't hold a model off the ground. */
export const visibleBounds = (object: Object3D): Box3 => {
  object.updateMatrixWorld(true);
  const box = new Box3();
  object.traverseVisible((child) => {
    if (child instanceof SkinnedMesh) {
      child.computeBoundingBox();
      child.computeBoundingSphere();
      box.union(child.boundingBox!.clone().applyMatrix4(child.matrixWorld));
    } else if (child instanceof Mesh) {
      child.geometry.computeBoundingBox();
      box.union(child.geometry.boundingBox!.clone().applyMatrix4(child.matrixWorld));
    }
  });
  return box;
};

/** Hides what an item has shed; the glb names each primitive's piece in its extras. */
const hideShed = (root: Object3D, hidden: ItemLook['hidden']): void => {
  if (hidden.length === 0) {
    return;
  }
  root.traverse((child) => {
    if (child instanceof Mesh && hidden.includes(child.geometry.userData.piece)) {
      child.visible = false;
    }
  });
};

/** Both forms of a loaded model. */
export const prepareModel = (def: ModelDef, scene: Object3D): Prepared => {
  applyModelMaterials(scene, MATERIALS);
  const box = visibleBounds(scene);
  const centre = box.getCenter(new Vector3());
  // On the ground: turned as it rests, then centred on x and z over the origin and resting on y = 0.
  // Standing upright raises the model's +x as an upright hold does.
  const rest = new Matrix4().makeRotationZ(def.rest === 'upright' ? Math.PI / 2 : 0);
  const rested = box.clone().applyMatrix4(rest);
  const restedCentre = rested.getCenter(new Vector3());
  const ground = around(scene, new Vector3(restedCentre.x, rested.min.y, restedCentre.z));
  modelFrame(ground, 'ground').quaternion.setFromRotationMatrix(rest);
  // Held: the grip at the origin, turned and rolled as the entry says, then oriented by its hold pose.
  // The lens is the `lens` anchor, else the `flame` anchor, else the middle of the model's front end.
  const anchor = def.anchors?.lens ?? def.anchors?.flame;
  const lens = anchor ? new Vector3(...anchor) : new Vector3(box.max.x, centre.y, centre.z);
  const turned = around(scene, def.grip ? new Vector3(...def.grip.at) : centre, lens);
  const [tx, ty, tz] = def.grip?.turn ?? [0, 0, 0];
  turned.rotation.set(MathUtils.degToRad(tx), MathUtils.degToRad(ty), MathUtils.degToRad(tz), 'XYZ');
  turned.rotateX(MathUtils.degToRad(def.roll ?? 0));
  const held = new Group().add(turned);
  ground.updateMatrixWorld(true);
  const groundParts: GroundModelPart[] = [];
  ground.traverseVisible((object) => {
    if (object instanceof Mesh) {
      groundParts.push({ geometry: object.geometry, material: object.material, matrix: object.matrixWorld.clone() });
    }
  });
  if (def.hold === 'upright') {
    held.rotation.z = Math.PI / 2;
  } else {
    held.rotation.y = Math.PI / 2;
  }
  return { ground, groundParts, held, scene };
};

/** `around`'s offset group, whose frame is the model file's: ground → offset; held → turned → offset. */
const modelFrame = (root: Object3D, form: 'ground' | 'held'): Object3D =>
  form === 'ground' ? root.children[0]! : root.children[0]!.children[0]!;

/** A held copy's group in the model file's own frame, for points authored in that frame. */
export const heldModelFrame = (root: Object3D): Object3D => modelFrame(root, 'held');

/** A ground copy's group in the model file's own frame, for points authored in that frame. */
export const groundModelFrame = (root: Object3D): Object3D => modelFrame(root, 'ground');

export const instantiateSkin = (scene: Object3D) => {
  const root = cloneSkeleton(scene);
  const bones = new Map<string, Bone>();
  const meshes: SkinnedMesh[] = [];
  root.traverse((node) => {
    if (node instanceof Bone) {
      if (bones.has(node.name)) {
        throw new Error(`Duplicate skin joint ${node.name}`);
      }
      node.updateMatrix();
      node.matrixAutoUpdate = false;
      bones.set(node.name, node);
    }
    if (node instanceof SkinnedMesh) {
      meshes.push(node);
    }
  });
  if (meshes.length === 0) {
    throw new Error('Model has no skin');
  }
  return {
    root,
    bones,
    /** Desired joint frames in the model root's frame; preserve solver scale and shear. */
    pose(frames: ReadonlyMap<string, Matrix4>): void {
      root.updateMatrixWorld(true);
      const desired = new Map<Bone, Matrix4>();
      for (const [name, bone] of bones) {
        const frame = frames.get(name);
        if (!frame?.elements.every(Number.isFinite) || frame.determinant() === 0) {
          throw new Error(`Invalid or missing joint frame ${name}`);
        }
        desired.set(bone, root.matrixWorld.clone().multiply(frame));
      }
      for (const [bone, world] of desired) {
        const { parent } = bone;
        const parentWorld = parent instanceof Bone ? desired.get(parent)! : (parent?.matrixWorld ?? new Matrix4());
        bone.matrix.copy(parentWorld).invert().multiply(world);
        bone.matrixWorldNeedsUpdate = true;
      }
      visibleBounds(root);
    },
    bounds: () => visibleBounds(root),
    dispose(): void {
      for (const skeleton of new Set(meshes.map((mesh) => mesh.skeleton))) {
        skeleton.dispose();
      }
    },
  };
};

export class ModelLibrary {
  /** Goes up each time a model loads, so what's drawn can catch up. */
  version = 0;
  private readonly ready = new Map<string, Prepared & { actionParts: readonly ActionPartPath[] }>();
  private readonly skins = new Map<string, Object3D>();
  /** Composed ground looks by `ItemLook.key`, so piles build each distinct look once. */
  private readonly composedGround = new Map<string, Object3D>();

  /** `report` hears about models that can't be drawn; it's never called during construction. */
  constructor(
    registry: Registry,
    report: (message: string) => void,
    files: Readonly<Record<string, string>> = PACK_FILES,
  ) {
    const loader = new GLTFLoader();
    for (const def of registry.models.values()) {
      const url = files[def.file];
      if (url === undefined) {
        queueMicrotask(() => report(`model "${def.id}": no file "${def.file}" in the pack`));
        continue;
      }
      loader.load(
        url,
        (gltf) => {
          try {
            let skinned = false;
            gltf.scene.traverse((node) => {
              if (node instanceof SkinnedMesh) {
                skinned = true;
              }
            });
            if (skinned) {
              applyModelMaterials(gltf.scene, MATERIALS);
              this.skins.set(def.id, gltf.scene);
              this.version += 1;
              return;
            }
            const actionParts = actionPartPaths(gltf.scene, def.gun?.action, gltf.parser, def.gun?.revolver);
            hideSlotNodes(def, gltf.scene, gltf.parser);
            this.ready.set(def.id, { ...prepareModel(def, gltf.scene), actionParts });
            this.version += 1;
          } catch (error) {
            report(`model "${def.id}" didn't load: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
        undefined,
        (error) => report(`model "${def.id}" didn't load: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  has(id: string): boolean {
    return this.ready.has(id) || this.skins.has(id);
  }

  /** Shared geometry/material parts and their prepared-ground transforms for instanced rendering. */
  groundParts(id: string): readonly GroundModelPart[] | undefined {
    return this.ready.get(id)?.groundParts;
  }

  /** A copy on the ground as its model rests: centred over its origin, resting on y = 0. */
  ground(id: string): Object3D | undefined {
    return this.ready.get(id)?.ground.clone();
  }

  /** A copy held at its grip in the model's configured pose. */
  held(id: string): HeldModel | undefined {
    const prepared = this.ready.get(id);
    return prepared ? cloneHeldModel(prepared.held, prepared.actionParts) : undefined;
  }

  /** A copy of a model in its own file frame, as another model's part; undefined until it loads. */
  part(id: string): Object3D | undefined {
    return this.ready.get(id)?.scene.clone();
  }

  /** An independently posed skin; never prepared as a rigid ground or held model. */
  skinned(id: string): ReturnType<typeof instantiateSkin> | undefined {
    const scene = this.skins.get(id);
    return scene ? instantiateSkin(scene) : undefined;
  }

  /** A part model's bounds in its own file frame. */
  partBounds(id: string): Box3 | undefined {
    const prepared = this.ready.get(id);
    return prepared && visibleBounds(prepared.scene);
  }

  /** An item's look held at its grip: the base model with each loaded part at its slot. */
  heldLook(look: ItemLook): ComposedHeld | undefined {
    const prepared = this.ready.get(look.model);
    if (!prepared) {
      return undefined;
    }
    const held = cloneHeldModel(prepared.held, prepared.actionParts);
    hideShed(held.root, look.hidden);
    return { ...held, slots: this.attachParts(modelFrame(held.root, 'held'), look) };
  }

  /** An item's look on the ground, resting on y = 0 with whatever is fitted; built once per look. */
  groundLook(look: ItemLook): Object3D | undefined {
    const cached = this.composedGround.get(look.key);
    if (cached) {
      return cached.clone();
    }
    const prepared = this.ready.get(look.model);
    if (!prepared) {
      return undefined;
    }
    const root = prepared.ground.clone();
    hideShed(root, look.hidden);
    const frame = modelFrame(root, 'ground');
    const slots = Object.values(this.attachParts(frame, look));
    if (slots.some((slot) => slot?.model)) {
      frame.position.y -= visibleBounds(root).min.y;
    }
    if (look.slots.every((slot) => slot.model === undefined || this.ready.has(slot.model))) {
      this.composedGround.set(look.key, root); // A part still loading would leave this look incomplete.
    }
    return root.clone();
  }

  private attachParts(frame: Object3D, look: ItemLook): ComposedHeld['slots'] {
    const slots: ComposedHeld['slots'] = {};
    for (const slot of look.slots) {
      const group = fittedPartFrame(slot);
      const model = slot.model === undefined ? undefined : this.part(slot.model);
      if (model) {
        group.add(model);
      }
      frame.add(group);
      slots[slot.slot] = { frame: group, ...(model ? { model, modelId: slot.model } : {}) };
    }
    return slots;
  }
}
