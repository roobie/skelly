// glTF names belong to the parser, not Object3D.name (Three.js sanitizes colons).
// Child-index paths carry the association into independent held clones without name lookup.

import type { GunModelDef, ModelDef } from '@skelly/engine/content';
import type { FirearmCycleFrame, RevolverFrame } from '@skelly/engine/inventory';
import {
  actionClock,
  actionCycleSeconds,
  actionStrokeTimes,
  type CylinderState,
  type FirearmAction,
  type FirearmMode,
  type HandSide,
  openClock,
} from '@skelly/engine/inventory';
import { heldAnchorOffset, type PressCheckSample, pressCheckSeconds, samplePressCheck } from '@skelly/engine/pose';
import { type Motion, poseAt, posePoint, type Rigid, type Vec3 } from '@skelly/motion/motion';
import { Matrix4, type Object3D, Vector3 } from 'three';
import type { GLTFParser } from 'three/addons/loaders/GLTFLoader.js';

export type { FirearmAction, FirearmMode } from '@skelly/engine/inventory';

export interface ActionPartPath {
  readonly id: string;
  readonly path: readonly number[];
  readonly nodeIndex: number;
  readonly modes: readonly FirearmMode[];
  /** The part's motion, in the exported model frame. */
  readonly motion?: Motion;
  /** Where a hand takes the part, in the exported model frame. */
  readonly handGrip?: Vec3;
  /** The node parent's local frame from the exported model frame. */
  readonly parentFromModel: Matrix4;
  readonly revolverPart?: keyof NonNullable<GunModelDef['revolver']>;
}

export interface HeldActionPart extends Omit<ActionPartPath, 'path'> {
  readonly node: Object3D;
  readonly restMatrix: Matrix4;
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

const heldNodePath = (scene: Object3D, node: Object3D, id: string): number[] => {
  const path: number[] = [];
  for (let current = node; current !== scene; ) {
    const { parent } = current;
    if (!parent) {
      throw new Error(`Action node ${id} is outside its scene`);
    }
    path.unshift(parent.children.indexOf(current));
    current = parent;
  }
  // prepareModel's held → turned → offset → cloned scene wrappers.
  return [0, 0, 0, ...path];
};

export const actionPartPaths = (
  scene: Object3D,
  action: FirearmAction | undefined,
  parser: GLTFParser,
  revolver?: GunModelDef['revolver'],
): ActionPartPath[] => {
  scene.updateMatrixWorld(true);
  const names = parser.json.nodes as readonly { name?: string }[];
  const definitions = revolver
    ? (['crane', 'cylinder', 'ejector', 'hammer', 'trigger'] as const).map((key) => ({
        id: key,
        node: revolver[key].node,
        modes: [] as FirearmMode[],
        revolverPart: key,
      }))
    : Object.entries(action?.parts ?? {}).map(([id, part]) => ({ id, ...part, revolverPart: undefined }));
  return definitions.map((part) => {
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
    return {
      id: part.id,
      path: heldNodePath(scene, node, part.node),
      nodeIndex,
      modes: part.modes,
      parentFromModel,
      ...('motion' in part ? { motion: part.motion } : {}),
      ...('handGrip' in part && part.handGrip ? { handGrip: part.handGrip } : {}),
      ...(part.revolverPart ? { revolverPart: part.revolverPart } : {}),
    };
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
    node.updateMatrix();
    return { ...part, node, restMatrix: node.matrix.clone() };
  });
  return { root, parts };
};

/** The seconds into the mode's timeline that `elapsed` of a `duration`-long cycle is at; absent outside the cycle. */
const timelineSeconds = (
  action: FirearmAction,
  mode: FirearmMode,
  elapsed: number,
  duration?: number,
): number | undefined => {
  const cycle = action[mode];
  const effective = duration ?? (cycle ? actionCycleSeconds(action, mode) : 0);
  if (!cycle || (mode === 'fire' && action.roundsPerSimMinute === undefined) || elapsed < 0 || elapsed >= effective) {
    return undefined;
  }
  return (elapsed * cycle.durationSimSeconds) / effective;
};

/**
 * Rendering alone samples the draw: 0 until the first leg to `open`, rising through it, 1 until the last leg to `open`
 * ends, then back to 0 over the leg after it. Admission and ejection remain gameplay.
 */
export const sampleActionStroke = (
  action: FirearmAction,
  mode: FirearmMode,
  elapsed: number,
  duration?: number,
): number => {
  const time = timelineSeconds(action, mode, elapsed, duration);
  if (time === undefined) {
    return 0;
  }
  const { reach, draw, release, forward } = actionStrokeTimes(action, mode);
  if (time <= reach) {
    return 0;
  }
  if (time < reach + draw) {
    return (time - reach) / draw;
  }
  return time < release || forward === 0 ? 1 : Math.max(0, 1 - (time - release) / forward);
};

/** Where an action stands: its cycle's draw, and how far along its own motion each part is. */
export interface ActionPose {
  readonly mode: FirearmMode | undefined;
  readonly stroke: number;
  readonly clockOf: (part: Pick<ActionPartPath, 'motion' | 'modes'>) => number;
}

const AT_REST: ActionPose = { mode: undefined, stroke: 0, clockOf: () => 0 };

export const sampleActionPose = (
  action: FirearmAction,
  frame: Pick<FirearmCycleFrame, 'mode' | 'elapsed' | 'duration' | 'actionOpen'> | undefined,
): ActionPose => {
  if (frame?.actionOpen) {
    return {
      mode: 'hand',
      stroke: 1,
      clockOf: ({ motion }) => openClock(motion),
    };
  }
  if (frame?.mode !== 'fire' && frame?.mode !== 'hand') {
    return AT_REST;
  }
  const { mode } = frame;
  const seconds = timelineSeconds(action, mode, frame.elapsed, frame.duration);
  if (seconds === undefined) {
    return { mode, stroke: 0, clockOf: () => 0 };
  }
  return {
    mode,
    stroke: sampleActionStroke(action, mode, frame.elapsed, frame.duration),
    clockOf: ({ motion, modes }) =>
      motion && modes.includes(mode) ? actionClock(action, mode, motion.stops, seconds) : 0,
  };
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

/** Presentation: the share of the pull spent getting the off hand onto the charging handle. */
const RACK_REACH_SHARE = 0.3;

/**
 * The off hand through a hand cycle, from the cycle's own timing: it takes the handle as the pull starts, rides it
 * back and holds it, then lets go and returns while the handle snaps forward. `seconds` is how far into the timeline
 * the handle the hand holds has gone, which stays where the hand let go once it has.
 */
export const rackGrip = (
  action: FirearmAction,
  elapsed: number,
  duration?: number,
): { reach: number; seconds: number } => {
  const time = timelineSeconds(action, 'hand', elapsed, duration);
  if (time === undefined) {
    return { reach: 0, seconds: 0 };
  }
  const { reach: approach, draw, release, forward } = actionStrokeTimes(action);
  const share = (part: number, whole: number): number => (whole > 0 ? Math.min(1, part / whole) : 1);
  return {
    reach:
      time < release
        ? smooth(share(time, approach || RACK_REACH_SHARE * draw))
        : 1 - smooth(share(time - release, forward)),
    seconds: Math.min(time, release),
  };
};

/** Presentation estimate: bound the geometry-derived turn while exposing an away-facing port. */
const MAX_RACK_CANT_RADIANS = Math.PI / 4;

export const rackCant = (
  model: ModelDef | undefined,
  hand: HandSide,
  frame:
    | {
        readonly mode: FirearmCycleFrame['mode'];
        readonly elapsed: number;
        readonly duration?: number;
      }
    | undefined,
  grip: { readonly x: number; readonly y: number },
): number => {
  if (
    !(
      model?.gun?.internalMagazine &&
      model.grip &&
      model.anchors?.ejection &&
      model.anchors.loading_port &&
      model.gun.action
    ) ||
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
  const stroke = sampleActionStroke(model.gun.action, 'hand', frame.elapsed, frame.duration);
  const eased = stroke * stroke * (3 - 2 * stroke);
  return portSide * angle * eased;
};

const rigidMatrix = ({ rotation: [x, y, z], shift }: Rigid): Matrix4 =>
  new Matrix4().set(x[0], x[1], x[2], shift[0], y[0], y[1], y[2], shift[1], z[0], z[1], z[2], shift[2], 0, 0, 0, 1);

/** A part's node matrix with its motion at `clock`, in its parent's frame. */
export const partMatrixAt = (part: HeldActionPart, clock: number): Matrix4 =>
  part.motion
    ? part.parentFromModel
        .clone()
        .multiply(rigidMatrix(poseAt(part.motion, clock)))
        .multiply(part.parentFromModel.clone().invert())
        .multiply(part.restMatrix)
    : part.restMatrix.clone();

/** Where a point of the part, given in the model frame, lies at `clock` in its parent's frame. */
export const partPointAt = (part: HeldActionPart, point: Vec3, clock: number): Vector3 =>
  new Vector3(...(part.motion ? posePoint(part.motion, point, clock) : point)).applyMatrix4(part.parentFromModel);

/** Each part moved to the clock `clockOf` gives it; the one poser of every part that moves by a motion. */
export const poseParts = (parts: readonly HeldActionPart[], clockOf: (part: HeldActionPart) => number): void => {
  for (const part of parts) {
    partMatrixAt(part, clockOf(part)).decompose(part.node.position, part.node.quaternion, part.node.scale);
    part.node.updateMatrix();
  }
};

export const poseActionParts = (parts: readonly HeldActionPart[], pose: ActionPose): void =>
  poseParts(parts, pose.clockOf);

/** Each part moved by its own share of its motion, as a press check moves the handle and the carrier apart. */
export const posePartShares = (parts: readonly HeldActionPart[], shares: Readonly<Record<string, number>>): void =>
  poseParts(parts, (part) => shares[part.id] ?? 0);

/** The press check where its job has reached: the job runs the clip scaled by the skill's handling factor. */
export const pressCheckAt = (
  clip: NonNullable<GunModelDef['pressCheck']>,
  frame: Pick<FirearmCycleFrame, 'elapsed' | 'duration'>,
): PressCheckSample => {
  const progress = frame.duration ? Math.min(1, Math.max(0, frame.elapsed / frame.duration)) : 0;
  return samplePressCheck(clip, progress * pressCheckSeconds(clip));
};

const rotationAbout = (pivot: readonly number[], axis: readonly number[], angle: number): Matrix4 =>
  new Matrix4()
    .makeTranslation(pivot[0]!, pivot[1]!, pivot[2]!)
    .multiply(new Matrix4().makeRotationAxis(new Vector3(...axis).normalize(), angle))
    .multiply(new Matrix4().makeTranslation(-pivot[0]!, -pivot[1]!, -pivot[2]!));

export const revolverOpenAmount = (
  open: boolean,
  step: RevolverFrame['step'] | undefined,
  progress: number,
): number => {
  if (step === 'open') {
    return progress;
  }
  if (step === 'close') {
    return 1 - progress;
  }
  return open ? 1 : 0;
};

const hammerAmount = (cocked: boolean, step: RevolverFrame['step'] | undefined, progress: number): number => {
  if (cocked) {
    return 1;
  }
  if (step === 'cock') {
    return progress;
  }
  return step === 'pull' ? Math.sin(progress * Math.PI) : 0;
};

const revolverMotion = (
  data: NonNullable<GunModelDef['revolver']>,
  cylinder: CylinderState,
  frame?: Pick<FirearmCycleFrame, 'elapsed' | 'duration' | 'revolver'>,
): Record<'crane' | 'cylinder' | 'ejector' | 'hammer' | 'trigger', Matrix4> => {
  const progress = smooth(Math.min(1, Math.max(0, (frame?.elapsed ?? 0) / (frame?.duration ?? 1))));
  const step = frame?.revolver?.step;
  const opening = revolverOpenAmount(cylinder.open, step, progress);
  const crane = rotationAbout(data.crane.pivot, data.crane.axis, data.crane.openRadians * opening);
  const pitch = (2 * Math.PI) / data.chambers;
  const advance = step === 'cock' || step === 'pull' ? progress : 0;
  const target = frame?.revolver?.chamber;
  const aligned = cylinder.open && target !== undefined ? target : cylinder.aligned + advance;
  const drum = rotationAbout(data.cylinder.centre, data.cylinder.axis, -aligned * pitch);
  const hammer = hammerAmount(cylinder.cocked, step, progress);
  const eject = step === 'eject' ? Math.sin(progress * Math.PI) : 0;
  return {
    crane,
    cylinder: crane.clone().multiply(drum),
    ejector: crane
      .clone()
      .multiply(
        new Matrix4().makeTranslation(
          ...(data.ejector.axis.map((value) => value * data.ejector.strokeMetres * eject) as [number, number, number]),
        ),
      ),
    hammer: rotationAbout(data.hammer.pivot, data.hammer.axis, data.hammer.cockRadians * hammer),
    trigger: rotationAbout(
      data.trigger.pivot,
      data.trigger.axis,
      data.trigger.pullRadians * (step === 'pull' ? Math.sin(progress * Math.PI) : 0),
    ),
  };
};

export const poseRevolverParts = (
  parts: readonly HeldActionPart[],
  data: NonNullable<GunModelDef['revolver']>,
  cylinder: CylinderState,
  frame?: Pick<FirearmCycleFrame, 'elapsed' | 'duration' | 'revolver'>,
): void => {
  const motion = revolverMotion(data, cylinder, frame);
  for (const part of parts) {
    const key = part.revolverPart;
    if (!key || key === 'chambers' || !part.parentFromModel) {
      continue;
    }
    const matrix = part.parentFromModel
      .clone()
      .multiply(motion[key])
      .multiply(part.parentFromModel.clone().invert())
      .multiply(part.restMatrix);
    matrix.decompose(part.node.position, part.node.quaternion, part.node.scale);
    part.node.updateMatrix();
  }
};
