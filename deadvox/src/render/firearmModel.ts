// glTF names belong to the parser, not Object3D.name (Three.js sanitizes colons).
// Child-index paths carry the association into independent held clones without name lookup.
import { Matrix4, type Object3D, Vector3 } from 'three';
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { actionCycleSeconds, type FirearmAction, type FirearmMode } from '../core/firearmAction.ts';

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
export const sampleActionStroke = (action: FirearmAction, mode: FirearmMode, elapsed: number): number => {
  const cycle = action[mode];
  if (!cycle || (mode === 'fire' && action.rpm === undefined)) {
    return 0;
  }
  const duration = actionCycleSeconds(action, mode);
  const time = (elapsed * cycle.durationSeconds) / duration;
  if (elapsed < 0 || elapsed >= duration) {
    return 0;
  }
  if (time < cycle.rearwardSeconds) {
    return time / cycle.rearwardSeconds;
  }
  const returnAt = cycle.rearwardSeconds + cycle.dwellSeconds;
  if (time < returnAt) {
    return 1;
  }
  return Math.max(0, 1 - (time - returnAt) / cycle.forwardSeconds);
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
