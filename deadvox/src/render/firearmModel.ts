// glTF names belong to the parser, not Object3D.name (Three.js sanitizes colons).
// Child-index paths carry the association into independent held clones without name lookup.
import { Matrix4, type Object3D, Vector3 } from 'three';
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelDef } from '../core/content.ts';
import { actionCycleSeconds, type FirearmAction, type FirearmMode } from '../core/firearmAction.ts';
import { heldAnchorOffset } from '../core/heldPose.ts';
import type { HandSide } from '../core/inventory.ts';

export type { FirearmAction, FirearmMode } from '../core/firearmAction.ts';

export interface ActionPartPath {
  readonly path: readonly number[];
  readonly nodeIndex: number;
  readonly modes: readonly FirearmMode[];
  /** Travel in the node parent's local frame, including the exported stroke length. */
  readonly travel: Vector3;
}

export interface HeldActionPart {
  readonly node: Object3D;
  readonly rest: Vector3;
  readonly travel: Vector3;
  readonly modes: readonly FirearmMode[];
  readonly nodeIndex: number;
}

export interface HeldModel {
  readonly root: Object3D;
  readonly parts: readonly HeldActionPart[];
}

/** The loaded objects of the given glTF node names, found by index because Three.js sanitizes names. */
export const namedNodes = (scene: Object3D, parser: GLTFParser, names: readonly string[]): Object3D[] => {
  const nodes = parser.json.nodes as readonly { name?: string }[];
  return names.map((name) => {
    const index = nodes.findIndex((definition) => definition.name === name);
    let node: Object3D | undefined;
    scene.traverse((object) => {
      if (parser.associations.get(object)?.nodes === index) {
        node = object;
      }
    });
    if (index < 0 || !node) {
      throw new Error(`Model node ${name} is not in its file`);
    }
    return node;
  });
};

export const actionPartPaths = (
  scene: Object3D,
  action: FirearmAction | undefined,
  parser: GLTFParser,
): ActionPartPath[] => {
  if (!action) {
    return [];
  }
  scene.updateMatrixWorld(true);
  const names = parser.json.nodes as readonly { name?: string }[];
  return Object.values(action.parts).map((part) => {
    const matches = names.flatMap((definition, index) => (definition.name === part.node ? [index] : []));
    if (matches.length !== 1) {
      throw new Error(`Action node ${part.node} needs exactly one glTF node`);
    }
    const nodeIndex = matches[0]!;
    let node: Object3D | undefined;
    scene.traverse((object) => {
      if (parser.associations.get(object)?.nodes === nodeIndex) {
        if (node) {
          throw new Error(`Action node ${part.node} has multiple loaded objects`);
        }
        node = object;
      }
    });
    if (!node?.parent) {
      throw new Error(`Action node ${part.node} has no loaded scene object`);
    }
    const parentFromModel = new Matrix4().copy(node.parent.matrixWorld).invert().multiply(scene.matrixWorld);
    const origin = new Vector3().applyMatrix4(parentFromModel);
    const travel = new Vector3(...part.axis)
      .multiplyScalar(part.strokeMetres)
      .applyMatrix4(parentFromModel)
      .sub(origin);
    const path: number[] = [];
    for (let current = node; current !== scene; ) {
      const { parent } = current;
      if (!parent) {
        throw new Error(`Action node ${part.node} is outside its scene`);
      }
      path.unshift(parent.children.indexOf(current));
      current = parent;
    }
    // prepareModel's held → turned → offset → cloned scene wrappers.
    return { path: [0, 0, 0, ...path], nodeIndex, modes: part.modes, travel };
  });
};

export const cloneHeldModel = (prepared: Object3D, paths: readonly ActionPartPath[]): HeldModel => {
  const root = prepared.clone();
  const parts = paths.map(({ path, ...part }) => {
    let node = root;
    for (const index of path) {
      const child = node.children[index];
      if (!child) {
        throw new Error(`Held clone lost action node ${part.nodeIndex}`);
      }
      node = child;
    }
    return { ...part, node, rest: node.position.clone() };
  });
  return { root, parts };
};

/** Rendering alone samples the rear/dwell/return profile; admission/ejection remain gameplay. */
export const sampleActionStroke = (
  action: FirearmAction,
  mode: FirearmMode,
  elapsed: number,
  duration?: number,
): number => {
  const cycle = action[mode];
  if (!cycle || (mode === 'fire' && action.roundsPerSimMinute === undefined)) {
    return 0;
  }
  const baseDuration = actionCycleSeconds(action, mode);
  const effectiveDuration = duration ?? baseDuration;
  const time = (elapsed * cycle.durationSimSeconds) / effectiveDuration;
  if (elapsed < 0 || elapsed >= effectiveDuration) {
    return 0;
  }
  if (time < cycle.rearwardSimSeconds) {
    return time / cycle.rearwardSimSeconds;
  }
  const returnAt = cycle.rearwardSimSeconds + cycle.dwellSimSeconds;
  if (time < returnAt) {
    return 1;
  }
  return Math.max(0, 1 - (time - returnAt) / cycle.forwardSimSeconds);
};

const smooth = (value: number): number => value * value * (3 - 2 * value);

/** Presentation: the share of a magazine job at each end spent reaching to the magazine and back. */
const MAGAZINE_REACH_SHARE = 0.15;

export interface MagazineMotion {
  /** How far the fitted magazine is out of the well, 0 seated to 1 clear; absent once it has left. */
  readonly outgoing?: number;
  /** How far the magazine going in still is from seated, 1 clear to 0 seated; absent before its turn. */
  readonly incoming?: number;
  /** How far the off hand has reached from its grip to the magazine. */
  readonly reach: number;
}

/**
 * A magazine job's pose from its progress alone: the fitted magazine leaves the well over the removal share, then
 * the new one seats over the rest. Only presentation reads it, so it adds no simulation or save state.
 */
export const magazineMotion = (elapsed: number, duration: number, removeShare: number): MagazineMotion => {
  const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 1;
  const reach = smooth(Math.min(1, progress / MAGAZINE_REACH_SHARE, (1 - progress) / MAGAZINE_REACH_SHARE));
  if (progress < removeShare) {
    return { outgoing: smooth(progress / removeShare), reach };
  }
  if (removeShare >= 1) {
    return { reach };
  }
  return { incoming: 1 - smooth((progress - removeShare) / (1 - removeShare)), reach };
};

/** Presentation estimate: bound the geometry-derived turn while exposing an away-facing port. */
const MAX_RACK_CANT_RADIANS = Math.PI / 4;

export const rackCant = (
  model: ModelDef | undefined,
  hand: HandSide,
  frame:
    | { readonly mode: FirearmMode | 'load' | 'magazine'; readonly elapsed: number; readonly duration?: number }
    | undefined,
  grip: { readonly x: number; readonly y: number },
): number => {
  if (
    !(model?.tube && model.grip && model.anchors?.ejection && model.anchors.loading_port && model.action) ||
    frame?.mode !== 'hand'
  ) {
    return 0;
  }
  const port = heldAnchorOffset(model, 'ejection');
  const loading = heldAnchorOffset(model, 'loading_port');
  const across = port[0] - loading[0];
  const portSide = Math.sign(across);
  if (portSide * (hand === 'right' ? 1 : -1) <= 0) {
    return 0; // The camera already sees this side from the opposite wielding hand.
  }
  const away = portSide * (grip.x + port[0]);
  if (away <= 0) {
    return 0;
  }
  // Clear the camera's tangent to the port, then reveal some aperture. A turn
  // derived only from port/loading separation can leave the side still hidden.
  const clearance = Math.atan2(away, -grip.y - port[1]);
  const reveal = Math.atan2(Math.abs(across), Math.abs(port[1] - loading[1]));
  const angle = Math.min(MAX_RACK_CANT_RADIANS, clearance + reveal);
  const stroke = sampleActionStroke(model.action, 'hand', frame.elapsed, frame.duration);
  const eased = stroke * stroke * (3 - 2 * stroke);
  return portSide * angle * eased;
};

export const poseActionParts = (
  parts: readonly HeldActionPart[],
  mode: FirearmMode | undefined,
  stroke: number,
): void => {
  for (const part of parts) {
    part.node.position.copy(part.rest);
    if (mode && part.modes.includes(mode)) {
      part.node.position.addScaledVector(part.travel, stroke);
    }
  }
};
