import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { EntityId } from '../core/entities.ts';
import type { ZombieSystem } from '../core/zombies.ts';
import type { ZombieRenderer } from '../render/mobActors.ts';
import { ragdollContent } from '../render/ragdoll.ts';

export function stageRagdollSweep({
  system,
  renderer,
  registry,
  origin,
  blockSize,
  seed,
  restored,
}: {
  system: ZombieSystem;
  renderer: ZombieRenderer;
  registry: Registry;
  origin: Vec3;
  blockSize: number;
  seed: number | undefined;
  restored: boolean;
}): (dt: number) => void {
  if (restored || seed === undefined) {
    return () => undefined;
  }
  const tuning = ragdollContent.sweep;
  const downed: EntityId[] = [];
  for (const [row, model] of tuning.models.entries()) {
    const type = [...registry.zombies.values()].find((candidate) => candidate.model === model)!;
    for (const [column, cuts] of tuning.cuts.entries()) {
      const position: Vec3 = [
        origin[0] + (tuning.startMetres[0]! + column * tuning.spacingMetres) / blockSize,
        origin[1],
        origin[2] + (tuning.startMetres[1]! - row * tuning.spacingMetres) / blockSize,
      ];
      const id = system.add(type, position);
      const zombie = system.store.get(id)!;
      const seeds = type.figureSeeds!;
      zombie.figureSeed = seeds[((seed % seeds.length) + seeds.length) % seeds.length]!;
      renderer.sync(system.store, 0, 1);
      const hit = { point: position, direction: [0, 0, -1] as Vec3, impulse: 1 };
      renderer.zombieWounded?.(id, hit);
      for (const part of cuts) {
        renderer.zombieSevered?.(id, part, hit, zombie);
        zombie.severed.push(part);
      }
      if (column === tuning.cuts.length - 1) {
        zombie.regions.torso = 0;
        zombie.incapacitated = true;
        renderer.zombieIncapacitated?.(id, zombie);
        downed.push(id);
      } else {
        renderer.zombieDied?.(id, zombie);
        system.store.remove(id);
      }
    }
  }
  let elapsed = 0;
  return (dt) => {
    elapsed += dt;
    if (elapsed >= tuning.finishSeconds) {
      for (const id of downed.splice(0)) {
        system.finishDowned(id, true);
      }
    }
  };
}
