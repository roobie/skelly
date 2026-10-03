import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { PlayerGait } from './footsteps.ts';
import type { Body } from './physics.ts';
import type { SoundEventId } from './soundEvents.ts';
import type { World } from './world.ts';

interface RustleSound {
  event: SoundEventId;
  position: Vec3;
}
export interface RustleClock {
  cells: ReadonlySet<string>;
  nextTime: number;
}
export const initialRustleClock = (): RustleClock => ({ cells: new Set(), nextTime: 0 });

/** Body overlap, not ground surface: litter changes footsteps but cannot brush the actor. */
const brushingCells = (body: Body, world: World, registry: Registry, fast: boolean): Map<string, RustleSound> => {
  const cells = new Map<string, RustleSound>();
  const [px, py, pz] = body.pos;
  for (let y = Math.floor(py); y < Math.ceil(py + body.height); y++) {
    for (let z = Math.floor(pz - body.halfWidth); z < Math.ceil(pz + body.halfWidth); z++) {
      for (let x = Math.floor(px - body.halfWidth); x < Math.ceil(px + body.halfWidth); x++) {
        const rustle = registry.blocks[world.getBlock(x, y, z)]?.rustle;
        if (rustle) {
          cells.set(`${x},${y},${z}`, {
            event: fast ? rustle.fast : rustle.gentle,
            position: [x + 0.5, y + 0.5, z + 0.5],
          });
        }
      }
    }
  }
  return cells;
};

/** Entry is attempted once; F4 admits or rejects it. Continued motion uses the content cooldown. */
export const foliageRustle = (
  clock: RustleClock,
  {
    body,
    world,
    registry,
    gait,
    moving,
    time,
  }: {
    body: Body;
    world: World;
    registry: Registry;
    gait: PlayerGait;
    moving: boolean;
    time: number;
  },
): { clock: RustleClock; sound?: RustleSound } => {
  const cells = brushingCells(body, world, registry, gait === 'jogging' || gait === 'sprinting');
  const entered = [...cells].find(([key]) => !clock.cells.has(key));
  const nextClock = { cells: new Set(cells.keys()), nextTime: clock.nextTime };
  if (!moving || (!entered && time < clock.nextTime)) {
    return { clock: nextClock };
  }
  const sound = entered?.[1] ?? cells.values().next().value;
  if (!sound) {
    return { clock: nextClock };
  }
  nextClock.nextTime = time + registry.sounds.get(sound.event)!.minIntervalSeconds;
  return { clock: nextClock, sound };
};
