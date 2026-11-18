import { figureVariantOf } from '@skelly/engine/internal/core/actorModels.ts';
import type { Actor } from '@skelly/engine/internal/core/actorState.ts';
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
