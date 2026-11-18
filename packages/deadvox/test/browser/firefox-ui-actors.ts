import { figureVariantOf } from '@skelly/engine/internal/core/actorModels.ts';
import type { Actor } from '@skelly/engine/internal/core/actorState.ts';
import type { Vec3 } from '@skelly/engine/world';
import { MobActorMeshes } from '@skelly/presentation/internal/render/mobActors.ts';
import type { PlayTestHandle } from './playTestHandle.ts';

const mobActorMeshes = ({ view }: PlayTestHandle) => {
  const { actorMeshes } = view;
  if (!(actorMeshes instanceof MobActorMeshes)) {
    throw new Error('firefox-ui draws actors with MobActorMeshes');
  }
  return actorMeshes;
};

/** The figure a world actor of `typeId` draws as, once one draws as its content figure variant. */
export const drawnFigureVariant = (play: PlayTestHandle, typeId: string) => {
  const actorMeshes = mobActorMeshes(play);
  for (const [id, actor] of play.session.actors.store.entries()) {
    const model = actor.type.id === typeId ? actorMeshes.drawnModel(id) : undefined;
    if (model !== undefined && model === figureVariantOf(actor.type)) {
      return model;
    }
  }
  return false;
};

/** The nearest acid zombie's id, once it draws as the acid model with its sac, drips and lights its slot. */
export const drippingAcidZombie = (play: PlayTestHandle) => {
  const { session, view } = play;
  const actorMeshes = mobActorMeshes(play);
  const [px, py, pz] = session.body.pos;
  const away = ([, actor]: readonly [unknown, Actor]) => {
    const [x, y, z] = actor.body.pos;
    return Math.hypot(x - px, y - py, z - pz);
  };
  const [found] = [...session.actors.store.entries()]
    .filter(([, actor]) => actor.type.id === 'acid_zombie')
    .sort((a, b) => away(a) - away(b));
  if (!found) {
    return false;
  }
  const body = found[1].type.acidBody;
  const lit = view.lightPool.lights.some(
    (light) => light.color.getHexString() === body?.color.slice(1) && light.distance === body?.light.radiusMetres,
  );
  const sac = actorMeshes.boneMatrix(found[0], 'sac.0');
  return actorMeshes.drawnModel(found[0]) === 'acid' &&
    lit &&
    sac?.some((value) => value !== 0) &&
    view.acidEffects.dropletCount() > 0
    ? found[0]
    : false;
};

/** Whether the dead acid zombie `id` has lost its sac to a full death splash. */
export const acidSacBurst = (play: PlayTestHandle, id: number) => {
  const actorMeshes = mobActorMeshes(play);
  const splash = play.engine.registry.actors.get('acid_zombie')?.acidBody?.deathSplash;
  return (
    splash !== undefined &&
    actorMeshes.boneMatrix(id, 'sac.0')?.every((value) => value === 0) === true &&
    play.view.acidEffects.dropletCount() >= splash.droplets
  );
};

const PROBE_SHOT = { damage: 0, reach: 100, cooldown: 0, impulse: 0, type: 'pierce' } as const;
/** Rays per side of the grid swept across a body's silhouette. */
const SWEEP_STEPS = 32;

const unitToward = (from: Vec3, [x, y, z]: Vec3): Vec3 => {
  const [dx, dy, dz] = [x - from[0], y - from[1], z - from[2]];
  const length = Math.hypot(dx, dy, dz);
  return [dx / length, dy / length, dz / length];
};
const yawOf = ([dx, , dz]: Vec3) => Math.atan2(-dx, -dz);
const pitchOf = ([, dy]: Vec3) => Math.asin(dy);

/**
 * Where the held gun's bore stands against actor `id`'s head: whether the actor lives, whether the bore strikes the
 * head first, and the look that turns the bore onto the head's middle. The shot leaves the muzzle, not the eye, and
 * a hit reports only the bones near its ray, so the head is found by sweeping rays from the muzzle across the
 * body's silhouette.
 */
export const boreOnHead = (play: PlayTestHandle, id: number) => {
  const { session, input } = play;
  const bore = play.heldFirearmBore();
  const target = session.actors.store.get(id);
  if (!(bore && target)) {
    return { alive: target !== undefined, onHead: false, look: undefined };
  }
  const strikesHead = (direction: Vec3) => {
    const aim = session.actors.aimAt(bore.origin, direction, PROBE_SHOT);
    return aim?.id === id && aim.region === 'head';
  };
  const {
    pos: [x, y, z],
    height,
  } = target.body;
  const across = Math.hypot(x - bore.origin[0], z - bore.origin[2]);
  const [sideX, sideZ] = [-(z - bore.origin[2]) / across, (x - bore.origin[0]) / across];
  const headPoints: Vec3[] = [];
  for (let row = 0; row <= SWEEP_STEPS; row += 1) {
    for (let column = 0; column <= SWEEP_STEPS; column += 1) {
      const side = height * (column / SWEEP_STEPS - 0.5);
      const point: Vec3 = [x + sideX * side, y + (height * row) / SWEEP_STEPS, z + sideZ * side];
      if (strikesHead(unitToward(bore.origin, point))) {
        headPoints.push(point);
      }
    }
  }
  const mean = (axis: 0 | 1 | 2) => headPoints.reduce((sum, point) => sum + point[axis], 0) / headPoints.length;
  const head = headPoints.length > 0 ? unitToward(bore.origin, [mean(0), mean(1), mean(2)]) : undefined;
  return {
    alive: true,
    onHead: strikesHead(bore.direction),
    look: head && {
      yaw: input.controls.yaw + yawOf(head) - yawOf(bore.direction),
      pitch: input.controls.pitch + pitchOf(head) - pitchOf(bore.direction),
    },
  };
};
