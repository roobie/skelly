import type { Registry } from '../engine/content.ts';
import { bodyPlanModel, figureVariantOf } from '../engine/pose.ts';
import type { ActorSystem, EntityId } from '../engine/sim.ts';
import type { Vec3 } from '../engine/world.ts';
import type { ActorRenderer } from '../render/mobActors.ts';
import { ragdollContent } from '../render/ragdoll.ts';

export function stageRagdollSweep({
  system,
  renderer,
  registry,
  origin,
  blockSize,
  seed,
  restored,
  groundAt,
}: {
  system: ActorSystem | undefined;
  renderer: ActorRenderer;
  registry: Registry;
  origin: Vec3;
  blockSize: number;
  seed: number | undefined;
  restored: boolean;
  groundAt: (x: number, z: number) => number;
}): (dt: number) => void {
  if (restored || seed === undefined || !system) {
    return () => undefined;
  }
  const tuning = ragdollContent.sweep;
  const downed: EntityId[] = [];
  for (const [row, model] of tuning.models.entries()) {
    const type = [...registry.actors.values()].find(
      (candidate) => bodyPlanModel(figureVariantOf(candidate)) === model,
    )!;
    for (const [column, cuts] of tuning.cuts.entries()) {
      const position: Vec3 = [
        origin[0] + (tuning.startMetres[0]! + row * tuning.spacingMetres) / blockSize,
        origin[1],
        origin[2] + (tuning.startMetres[1]! + column * tuning.spacingMetres) / blockSize,
      ];
      position[1] = groundAt(position[0], position[2]);
      const id = system.add(type, position);
      const actor = system.store.get(id)!;
      const seeds = type.figureSeeds!;
      actor.figureSeed = seeds[((seed % seeds.length) + seeds.length) % seeds.length]!;
      renderer.sync(system.store, 0, 1);
      const hit = { point: position, direction: [0, 0, -1] as Vec3, impulse: 1 };
      renderer.actorWounded?.(id, hit);
      for (const part of cuts) {
        renderer.actorSevered?.(id, part, hit, actor);
        actor.severed.push(part);
      }
      if (column === tuning.cuts.length - 1) {
        actor.regions.torso = 0;
        actor.incapacitated = true;
        renderer.actorIncapacitated?.(id, actor);
        downed.push(id);
      } else {
        renderer.actorDied?.(id, actor);
        system.store.remove(id);
      }
    }
  }
  const living: { id: EntityId; cuts: string[] }[] = [];
  for (const [row, model] of tuning.models.entries()) {
    const type = [...registry.actors.values()].find(
      (candidate) => bodyPlanModel(figureVariantOf(candidate)) === model,
    )!;
    for (const [column, cuts] of tuning.crawlCuts.entries()) {
      const position: Vec3 = [
        origin[0] + (tuning.startMetres[0]! + row * tuning.spacingMetres) / blockSize,
        origin[1],
        origin[2] + (tuning.startMetres[1]! + (tuning.cuts.length + column) * tuning.spacingMetres) / blockSize,
      ];
      position[1] = groundAt(position[0], position[2]);
      living.push({ id: system.add(type, position), cuts });
    }
  }
  const collapseLiving = () => {
    for (const { id, cuts } of living.splice(0)) {
      const actor = system.store.get(id);
      if (!actor) {
        continue;
      }
      const hit = { point: actor.body.pos, direction: [0, 0, -1] as Vec3, impulse: 1 };
      renderer.actorWounded?.(id, hit);
      for (const part of cuts) {
        actor.severed.push(part);
        renderer.actorSevered?.(id, part, hit, actor);
      }
    }
  };
  let elapsed = 0;
  return (dt) => {
    elapsed += dt;
    if (elapsed >= tuning.crawlDelaySeconds) {
      collapseLiving();
    }
    if (elapsed >= tuning.finishSeconds) {
      for (const id of downed.splice(0)) {
        system.finishDowned(id, true);
      }
    }
  };
}
