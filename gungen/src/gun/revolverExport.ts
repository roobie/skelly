import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { partNodeName } from '@skelly/engine/export/glb.ts';
import {
  applyDir,
  applyPoint,
  compose,
  normalize,
  sub,
  type Transform,
  type Vec3,
} from '@skelly/engine/foundation/math.ts';
import { localSolidBounds, penetrationWorld, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import type { Cartridge } from '../ammo/cartridge.ts';
import { toFileAxes } from './exportFrame.ts';

interface Rotation {
  readonly node: string;
  readonly pivot: Vec3;
  readonly axis: Vec3;
}
export interface RevolverMetadata {
  readonly chambers: number;
  readonly crane: Rotation & { readonly openRadians: number };
  readonly cylinder: {
    readonly node: string;
    readonly centre: Vec3;
    readonly axis: Vec3;
    readonly chamberRadiusMetres: number;
    readonly chamberZeroRadians: number;
  };
  readonly ejector: { readonly node: string; readonly axis: Vec3; readonly strokeMetres: number };
  readonly hammer: Rotation & { readonly cockRadians: number };
  readonly trigger: Rotation & { readonly pullRadians: number };
}

const rotateRevolverX = (pivot: Vec3, angle: number): Transform => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const r = [1, 0, 0, 0, c, -s, 0, s, c] as const;
  const rotated = applyPoint({ r, t: [0, 0, 0] }, pivot);
  return { r, t: sub(pivot, rotated) };
};

export const revolverMetadata = (resolved: Resolved, cartridge?: Cartridge): RevolverMetadata | undefined => {
  const find = (family: string) => [...resolved.defs].find(([, def]) => def.family === family);
  const cylinder = find('revolver-cylinder');
  if (!(cylinder && cartridge)) {
    return undefined;
  }
  if (cartridge.kind !== 'metallic' || cartridge.case.length.value === null) {
    throw new Error('Revolver export needs a sourced metallic case length');
  }
  const part = (family: string) => {
    const entry = find(family);
    if (!entry) {
      throw new Error(`Missing revolver part ${family}`);
    }
    const [id, def] = entry;
    const placed = resolved.placed.get(id)!;
    return { id, def, placed, node: partNodeName(id, family) };
  };
  const frame = part('revolver-frame');
  const crane = part('revolver-crane');
  const drum = part('revolver-cylinder');
  const ejector = part('revolver-ejector');
  const hammer = part('revolver-hammer');
  const trigger = part('revolver-trigger');
  const solid = (solids: readonly Solid[], id: string) => {
    const result = solids.find((value) => value.id === id);
    if (!result) {
      throw new Error(`Missing revolver solid ${id}`);
    }
    return result;
  };
  const yoke = solid(crane.def.solids, 'crane-yoke');
  if (yoke.kind !== 'extruded-polygon') {
    throw new Error('Crane needs a hinge profile');
  }
  const bottom = Math.min(...yoke.profile.map(([, y]) => y));
  const hingeEdge = yoke.profile.filter(([, y]) => y === bottom);
  const pivot = applyPoint(crane.placed, [
    hingeEdge.reduce((sum, [x]) => sum + x, 0) / hingeEdge.length,
    bottom,
    yoke.z[0],
  ]);
  const axis = drum.def.axes.find(({ kind }) => kind === 'revolver-cylinder')!;
  const centre = applyPoint(drum.placed, axis.origin);
  const swing = frame.def.keepOuts.find(({ id }) => id === 'cylinder-swing')!;
  const side = Math.sign(applyPoint(frame.placed, swing.box.center)[2] - centre[2]);
  const obstacles = frame.def.solids.map((shape) => worldSolid(frame.placed, shape));
  const drumSolid = solid(drum.def.solids, 'drum');
  if (drumSolid.kind !== 'extruded-polygon' || drumSolid.axis !== 'x') {
    throw new Error('Cylinder needs an axial drum');
  }
  const swingCentre = applyPoint(frame.placed, swing.box.center);
  let openRadians: number | undefined;
  for (let step = 1; step < 180; step++) {
    const angle = (side * step * Math.PI) / 180;
    const rotation = rotateRevolverX(pivot, angle);
    const shape = worldSolid(compose(rotation, drum.placed), drumSolid);
    if (
      side * (applyPoint(rotation, centre)[2] - swingCentre[2]) >= 0 &&
      obstacles.every((obstacle) => penetrationWorld(shape, obstacle) <= 1e-7)
    ) {
      openRadians = angle;
      break;
    }
  }
  if (openRadians === undefined) {
    throw new Error('Cylinder cannot clear the frame on its reserved swing side');
  }
  const unit = resolved.domain.units.metresPerUnit;
  const point = (value: Vec3): Vec3 => toFileAxes(value).map((coordinate) => coordinate * unit) as unknown as Vec3;
  const direction = (placed: Transform, value: Vec3): Vec3 => normalize(toFileAxes(applyDir(placed, value)));
  const pin = (shape: Solid, upper: boolean): Vec3 => {
    if (shape.kind !== 'extruded-polygon') {
      throw new Error('Pin needs a profile');
    }
    const y = (upper ? Math.max : Math.min)(...shape.profile.map(([, value]) => value));
    const edge = shape.profile.filter(([, value]) => value === y);
    return [edge.reduce((sum, [x]) => sum + x, 0) / edge.length, y, (shape.z[0] + shape.z[1]) / 2];
  };
  const hammerPin = pin(solid(hammer.def.solids, 'exposed-hammer-body'), false);
  const triggerPin = pin(solid(trigger.def.solids, 'curved-trigger-0'), true);
  const signedAngle = (from: Vec3, target: Vec3) =>
    Math.atan2(from[0] * target[1] - from[1] * target[0], from[0] * target[0] + from[1] * target[1]);
  const [spurMin, spurMax] = localSolidBounds(solid(hammer.def.solids, 'exposed-hammer-spur'));
  const spur: Vec3 = [spurMin[0], spurMax[1], 0];
  const travel = frame.def.keepOuts.find(({ id }) => id === 'hammer-travel')!.box;
  const hammerTarget: Vec3 = [travel.center[0] - travel.half[0], travel.center[1], 0];
  const [tipMin, tipMax] = localSolidBounds(solid(trigger.def.solids, 'curved-trigger-3'));
  const tip: Vec3 = [(tipMin[0] + tipMax[0]) / 2, tipMin[1], 0];
  const guards = frame.def.solids.filter(({ id }) => id.startsWith('trigger-guard-')).map(localSolidBounds);
  const triggerTarget: Vec3 = [Math.min(...guards.map(([min]) => min[0])), tip[1], 0];
  const bore = drum.def.axes.find(({ kind }) => kind === 'bore')!;
  const chamberOffset = sub(bore.origin, axis.origin);
  return {
    chambers: Number(resolved.params.get(drum.id)!.chamberCount!.value),
    crane: { node: crane.node, pivot: point(pivot), axis: direction(drum.placed, axis.dir), openRadians },
    cylinder: {
      node: drum.node,
      centre: point(centre),
      axis: direction(drum.placed, axis.dir),
      chamberRadiusMetres: Math.hypot(chamberOffset[1], chamberOffset[2]) * unit,
      chamberZeroRadians: Math.atan2(chamberOffset[2], chamberOffset[1]),
    },
    ejector: {
      node: ejector.node,
      axis: direction(ejector.placed, [-1, 0, 0]),
      strokeMetres: cartridge.case.length.value / 1000,
    },
    hammer: {
      node: hammer.node,
      pivot: point(applyPoint(hammer.placed, hammerPin)),
      axis: direction(hammer.placed, [0, 0, 1]),
      cockRadians: signedAngle(sub(spur, hammerPin), sub(hammerTarget, hammerPin)),
    },
    trigger: {
      node: trigger.node,
      pivot: point(applyPoint(trigger.placed, triggerPin)),
      axis: direction(trigger.placed, [0, 0, 1]),
      pullRadians: signedAngle(sub(tip, triggerPin), sub(triggerTarget, triggerPin)),
    },
  };
};
