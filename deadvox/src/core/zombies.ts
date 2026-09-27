import type { ZombieDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type EntityId, type EntityStore, MapEntityStore } from './entities.ts';
import { type Body, type PhysicsParams, stepBody } from './physics.ts';
import { raycast, type SolidAt } from './raycast.ts';

export type PlayerMovement = 'walking' | 'jogging' | 'sprinting' | 'still';
export type ZombieMode = 'wander' | 'chase' | 'investigate' | 'return';

export const FISTS_MELEE = { damage: 8, reach: 0.7, cooldown: 0.8, stamina: 4 } as const;

export interface Zombie {
  type: ZombieDef;
  body: Body;
  facing: Vec3;
  home: Vec3;
  mode: ZombieMode;
  health: number;
  lastPerceived?: Vec3 | undefined;
  attackWait: number;
  /** Unwrapped gait phase; advances by π for each travelled stepLength metres. */
  gaitPhase: number;
  /** Elapsed wandering time, independent of the distance-driven gait. */
  wanderClock: number;
}

export interface PlayerSense {
  pos: Vec3;
  /** Direction the player faces, in the x/z plane. */
  facing: Vec3;
  movement: PlayerMovement;
  lit: boolean;
  lightSeenFrom: number;
}

export interface ZombieSystemOptions {
  store?: EntityStore<Zombie>;
  isSolid: SolidAt;
  blockSize: number;
  physics: PhysicsParams;
  jumpSpeed: number;
  player: () => PlayerSense;
  hour: () => number;
  hurtPlayer: (amount: number) => void;
  onDeath?: (zombie: Zombie) => void;
}

const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

/** Daylight follows the sky's 06:30 dawn and 19:30 dusk keys. */
export const isDaylight = (hour: number): boolean => hour >= 6.5 && hour < 19.5;

/** The seam for later voxel light: currently daylight or the player's own lit flashlight. */
export const isLit = (_isSolid: SolidAt, _position: Vec3, hour: number, flashlightLit: boolean): boolean =>
  isDaylight(hour) || flashlightLit;

export interface PerceptionInput {
  zombie: ZombieDef;
  from: Vec3;
  facing: Vec3;
  player: PlayerSense;
  hour: number;
  blockSize: number;
  isSolid: SolidAt;
}

/** Returns sight/hearing perception using metres for all distances and angles. */
export const perceivePlayer = ({
  zombie,
  from,
  facing,
  player,
  hour,
  blockSize,
  isSolid,
}: PerceptionInput): boolean => {
  const delta = sub(player.pos, from);
  const metres = Math.hypot(...delta) * blockSize;
  const dir = unit(delta);
  const look = unit(facing);
  const dot = Math.max(-1, Math.min(1, look[0] * dir[0] + look[2] * dir[2]));
  const inCone = dot >= Math.cos((zombie.sightCone * Math.PI) / 180);
  if (inCone && metres > 0) {
    const rayOrigin: Vec3 = [from[0], from[1] + 1.3 / blockSize, from[2]];
    const rayTarget: Vec3 = [player.pos[0], player.pos[1] + 1.3 / blockSize, player.pos[2]];
    const toTarget = sub(rayTarget, rayOrigin);
    const rayDistance = Math.hypot(...toTarget);
    const clear = raycast(rayOrigin, unit(toTarget), rayDistance, isSolid) === undefined;
    const lit = isLit(isSolid, player.pos, hour, player.lit);
    let sightRange = zombie.sight;
    if (!isDaylight(hour)) {
      sightRange = zombie.nightSight;
    }
    if (lit && player.lit) {
      sightRange = player.lightSeenFrom;
    }
    if (clear && metres <= sightRange) {
      return true;
    }
  }

  let hearingRange = 0;
  if (player.movement === 'sprinting') {
    hearingRange = zombie.hearingRange.sprint;
  } else if (player.movement === 'jogging') {
    hearingRange = zombie.hearingRange.jog;
  } else if (player.movement === 'walking') {
    hearingRange = zombie.hearingRange.walk;
  }
  return hearingRange > 0 && metres <= hearingRange * zombie.hearing;
};

export class ZombieSystem {
  readonly store: EntityStore<Zombie>;
  private readonly options: ZombieSystemOptions;
  private playerAttackWait = 0;

  constructor(options: ZombieSystemOptions) {
    this.options = options;
    this.store = options.store ?? new MapEntityStore<Zombie>();
  }

  add(type: ZombieDef, position: Vec3, facing: Vec3 = [0, 0, -1]): EntityId {
    return this.store.add({
      type,
      body: {
        pos: copy(position),
        vel: [0, 0, 0],
        halfWidth: 0.28 / this.options.blockSize,
        height: 1.7 / this.options.blockSize,
        onGround: false,
      },
      facing: unit(facing),
      home: copy(position),
      mode: 'wander',
      health: type.health,
      attackWait: 0,
      gaitPhase: 0,
      wanderClock: 0,
    });
  }

  /** Advances every zombie at a fixed caller-supplied simulation dt. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-entity AI update is one cohesive ordered simulation pass.
  tick(dt: number): void {
    if (dt <= 0) {
      return;
    }
    const player = this.options.player();
    const hour = this.options.hour();
    const { blockSize, isSolid } = this.options;
    for (const [, zombie] of this.store.entries()) {
      zombie.attackWait = Math.max(0, zombie.attackWait - dt);
      const { pos } = zombie.body;
      const sees = perceivePlayer({
        zombie: zombie.type,
        from: pos,
        facing: zombie.facing,
        player,
        hour,
        blockSize,
        isSolid,
      });
      if (sees) {
        zombie.mode = 'chase';
        zombie.lastPerceived = copy(player.pos);
      } else if (zombie.mode === 'chase') {
        zombie.mode = 'investigate';
      }

      const wanderRadius = 1.5;
      const wanderAngle = (zombie.wanderClock * zombie.type.speed.wander) / wanderRadius;
      const homeTarget: Vec3 =
        zombie.mode === 'wander'
          ? [
              zombie.home[0] + (Math.sin(wanderAngle) * wanderRadius) / blockSize,
              zombie.home[1],
              zombie.home[2] + (Math.cos(wanderAngle) * wanderRadius) / blockSize,
            ]
          : zombie.home;
      let target = homeTarget;
      if (zombie.mode === 'chase') {
        target = player.pos;
      } else if (zombie.mode === 'investigate') {
        target = zombie.lastPerceived ?? zombie.home;
      }
      const offset: Vec3 = [target[0] - pos[0], 0, target[2] - pos[2]];
      const metresToTarget = horizontalDistance(target, pos) * blockSize;
      if (zombie.mode === 'investigate' && metresToTarget <= 1) {
        zombie.mode = 'return';
      }
      const speed = zombie.mode === 'chase' ? zombie.type.speed.chase : zombie.type.speed.wander;
      const moving = metresToTarget > (zombie.mode === 'chase' ? zombie.type.attack.reach * 0.9 : 0.25);
      if (moving) {
        const dir = unit(offset);
        zombie.body.vel[0] = (dir[0] * speed) / blockSize;
        zombie.body.vel[2] = (dir[2] * speed) / blockSize;
        zombie.facing = dir;
        // If a solid is immediately ahead, jump using the same take-off as the player.
        const probe: Vec3 = [
          pos[0] + (dir[0] * 0.65) / blockSize,
          pos[1] + 0.1 / blockSize,
          pos[2] + (dir[2] * 0.65) / blockSize,
        ];
        if (zombie.body.onGround && isSolid(Math.floor(probe[0]), Math.floor(probe[1]), Math.floor(probe[2]))) {
          zombie.body.vel[1] = this.options.jumpSpeed / blockSize;
        }
      } else {
        zombie.body.vel[0] = 0;
        zombie.body.vel[2] = 0;
      }
      const beforeStep: Vec3 = [...pos];
      stepBody(zombie.body, dt, isSolid, this.options.physics);
      const travelled = horizontalDistance(beforeStep, zombie.body.pos) * blockSize;
      zombie.gaitPhase += (travelled / zombie.type.stepLength) * Math.PI;
      if (zombie.mode === 'wander') {
        zombie.wanderClock += dt;
      }

      if (
        zombie.mode === 'chase' &&
        horizontalDistance(player.pos, zombie.body.pos) * blockSize <= zombie.type.attack.reach &&
        Math.abs(player.pos[1] - zombie.body.pos[1]) * blockSize < 1.7 &&
        zombie.attackWait <= 0
      ) {
        const chestOffset = 1 / blockSize;
        const zombieChest: Vec3 = [pos[0], pos[1] + chestOffset, pos[2]];
        const playerChest: Vec3 = [player.pos[0], player.pos[1] + chestOffset, player.pos[2]];
        const toPlayer = sub(playerChest, zombieChest);
        const chestDistance = Math.hypot(...toPlayer);
        if (chestDistance > 0 && raycast(zombieChest, unit(toPlayer), chestDistance, isSolid) === undefined) {
          this.options.hurtPlayer(zombie.type.attack.damage);
          zombie.attackWait = zombie.type.attack.cooldown;
        }
      }
      if (zombie.mode === 'return' && horizontalDistance(zombie.home, zombie.body.pos) * blockSize < 0.4) {
        zombie.mode = 'wander';
        zombie.lastPerceived = undefined;
      }
    }
    this.playerAttackWait = Math.max(0, this.playerAttackWait - dt);
  }

  unsafeReason(playerPos = this.options.player().pos): string | undefined {
    const { blockSize } = this.options;
    for (const [, zombie] of this.store.entries()) {
      if (zombie.mode === 'chase' || horizontalDistance(zombie.body.pos, playerPos) * blockSize <= 30) {
        return 'A shambler is close';
      }
    }
    return undefined;
  }

  /** Strikes the first visible zombie within the held weapon's reach. */
  swing(
    origin: Vec3,
    direction: Vec3,
    weapon: { damage: number; reach: number; cooldown: number },
  ): EntityId | undefined {
    if (this.playerAttackWait > 0) {
      return undefined;
    }
    const dir = unit(direction);
    let found: [EntityId, Zombie, number] | undefined;
    for (const [id, zombie] of this.store.entries()) {
      const center: Vec3 = [zombie.body.pos[0], zombie.body.pos[1] + zombie.body.height * 0.55, zombie.body.pos[2]];
      const delta = sub(center, origin);
      const along = delta[0] * dir[0] + delta[1] * dir[1] + delta[2] * dir[2];
      const perpendicular = Math.hypot(delta[0] - along * dir[0], delta[1] - along * dir[1], delta[2] - along * dir[2]);
      const metres = along * this.options.blockSize;
      if (
        metres < 0 ||
        metres > weapon.reach ||
        perpendicular * this.options.blockSize > 0.65 ||
        raycast(origin, dir, along, this.options.isSolid)
      ) {
        continue;
      }
      if (!found || along < found[2]) {
        found = [id, zombie, along];
      }
    }
    if (!found) {
      return undefined;
    }
    this.playerAttackWait = weapon.cooldown;
    const [id, zombie] = found;
    zombie.health -= weapon.damage;
    if (zombie.health <= 0) {
      this.store.remove(id);
      this.options.onDeath?.(zombie);
    }
    return id;
  }
}
