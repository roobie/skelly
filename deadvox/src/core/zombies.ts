import type { ZombieDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type EntityId, type EntityStore, MapEntityStore } from './entities.ts';
import { Rng } from './random.ts';
import { type Body, type PhysicsParams, separateBodies, separateBodyPair, stepBody } from './physics.ts';
import { raycast, type SolidAt } from './raycast.ts';

export type PlayerMovement = 'walking' | 'jogging' | 'sprinting' | 'still';
export type ZombieMode = 'idle' | 'stroll' | 'chase' | 'investigate' | 'return';

export const FISTS_MELEE = { damage: 8, reach: 0.7, cooldown: 0.8, stamina: 4 } as const;

export interface Zombie {
  type: ZombieDef;
  body: Body;
  facing: Vec3;
  home: Vec3;
  mode: ZombieMode;
  /** Per-body behavior stream; draws never perturb another body. */
  behaviorRng: Rng;
  modeTimer: number;
  strollHeading: Vec3;
  horizontalSpeed: number;
  bodyLookTarget: number;
  headYaw: number;
  headYawTarget: number;
  lookTimer: number;
  /** Previous fixed-step pose used only by rendering interpolation. */
  renderPrevious: { pos: Vec3; facing: Vec3; headYaw: number; gaitPhase: number };
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
  /** When present, the solid player box used for hard movement collisions. */
  body?: Body | undefined;
  /** Direction the player faces, in the x/z plane. */
  facing: Vec3;
  movement: PlayerMovement;
  lit: boolean;
  lightSeenFrom: number;
}

export interface ZombieSystemOptions {
  store?: EntityStore<Zombie>;
  seed?: number;
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
const angleOf = (v: Vec3): number => Math.atan2(v[0], v[2]);
const headingAt = (angle: number): Vec3 => [Math.sin(angle), 0, Math.cos(angle)];
const wrapAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
const approach = (current: number, target: number, amount: number): number =>
  current < target ? Math.min(target, current + amount) : Math.max(target, current - amount);
const approachAngle = (current: number, target: number, amount: number): number =>
  current + Math.sign(wrapAngle(target - current)) * Math.min(Math.abs(wrapAngle(target - current)), amount);
const turnToward = (current: Vec3, target: Vec3, radians: number): Vec3 =>
  headingAt(approachAngle(angleOf(current), angleOf(target), radians));
const inRange = (rng: Rng, range: { min: number; max: number }): number => rng.range(range.min, range.max);

interface JumpObstacleProbe {
  body: Body;
  direction: Vec3;
  isSolid: SolidAt;
  physics: PhysicsParams;
  jumpSpeed: number;
  blockSize: number;
}

const canJumpObstacle = ({ body, direction, isSolid, physics, jumpSpeed, blockSize }: JumpObstacleProbe): boolean => {
  const maxJumpMetres = (jumpSpeed * jumpSpeed) / (2 * physics.gravity * blockSize);
  const probeX = Math.floor(body.pos[0] + (direction[0] * 0.65) / blockSize);
  const probeZ = Math.floor(body.pos[2] + (direction[2] * 0.65) / blockSize);
  const footCell = Math.floor(body.pos[1] + 0.01);
  const maxTop = Math.floor(body.pos[1] + maxJumpMetres / blockSize);
  let top = footCell;
  while (top <= maxTop && isSolid(probeX, top, probeZ)) {
    top += 1;
  }
  if (top === footCell) {
    return false;
  }
  const riseMetres = (top - body.pos[1]) * blockSize;
  if (riseMetres <= physics.stepHeight * blockSize || riseMetres > maxJumpMetres) {
    return false;
  }
  for (let y = top; y < Math.ceil(top + body.height); y++) {
    if (isSolid(probeX, y, probeZ)) {
      return false;
    }
  }
  return true;
};

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

  private beginIdle(zombie: Zombie): void {
    zombie.mode = 'idle';
    zombie.modeTimer = inRange(zombie.behaviorRng, zombie.type.wander.idleSeconds);
    zombie.lookTimer = 0;
    zombie.bodyLookTarget = angleOf(zombie.facing);
    zombie.headYawTarget = 0;
    zombie.horizontalSpeed = 0;
    zombie.body.vel[0] = 0;
    zombie.body.vel[2] = 0;
  }

  private beginStroll(zombie: Zombie): void {
    const { type, body, home, behaviorRng } = zombie;
    const duration = inRange(behaviorRng, type.wander.strollSeconds);
    let heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    const endpoint: Vec3 = [
      body.pos[0] + (heading[0] * type.speed.wander * duration) / this.options.blockSize,
      body.pos[1],
      body.pos[2] + (heading[2] * type.speed.wander * duration) / this.options.blockSize,
    ];
    if (horizontalDistance(endpoint, home) * this.options.blockSize > type.wander.leashMetres) {
      heading = unit([home[0] - body.pos[0], 0, home[2] - body.pos[2]]);
    }
    if (Math.hypot(...heading) === 0) {
      heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    }
    zombie.mode = 'stroll';
    zombie.modeTimer = duration;
    zombie.strollHeading = heading;
    zombie.bodyLookTarget = angleOf(heading);
    zombie.headYawTarget = 0;
  }

  add(type: ZombieDef, position: Vec3, facing: Vec3 = [0, 0, -1]): EntityId {
    const direction = unit(facing);
    const zombie: Zombie = {
      type,
      body: {
        pos: copy(position),
        vel: [0, 0, 0],
        halfWidth: 0.28 / this.options.blockSize,
        height: 1.7 / this.options.blockSize,
        onGround: false,
      },
      facing: direction,
      home: copy(position),
      mode: 'idle',
      behaviorRng: Rng.stream(this.options.seed ?? 0, `zombie:${this.store.size + 1}`),
      modeTimer: 0,
      strollHeading: copy(direction),
      horizontalSpeed: 0,
      bodyLookTarget: angleOf(direction),
      headYaw: 0,
      headYawTarget: 0,
      lookTimer: 0,
      renderPrevious: { pos: copy(position), facing: copy(direction), headYaw: 0, gaitPhase: 0 },
      health: type.health,
      attackWait: 0,
      gaitPhase: 0,
      wanderClock: 0,
    };
    const id = this.store.add(zombie);
    // EntityStore ids are stable within the world's entity lifetime.
    zombie.behaviorRng = Rng.stream(this.options.seed ?? 0, `zombie:${id}`);
    this.beginIdle(zombie);
    return id;
  }

  /** Advances every zombie at a fixed caller-supplied simulation dt. */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: per-entity AI update is one cohesive ordered simulation pass.
  tick(dt: number): void {
    if (dt <= 0) return;
    const player = this.options.player();
    const hour = this.options.hour();
    const { blockSize, isSolid } = this.options;
    const entries = [...this.store.entries()];
    for (const [, zombie] of entries) {
      zombie.renderPrevious = {
        pos: copy(zombie.body.pos),
        facing: copy(zombie.facing),
        headYaw: zombie.headYaw,
        gaitPhase: zombie.gaitPhase,
      };
      zombie.attackWait = Math.max(0, zombie.attackWait - dt);
      const { pos } = zombie.body;
      const { type, behaviorRng: rng } = zombie;
      const sees = perceivePlayer({ zombie: type, from: pos, facing: zombie.facing, player, hour, blockSize, isSolid });
      if (sees) {
        zombie.mode = 'chase';
        zombie.lastPerceived = copy(player.pos);
      } else if (zombie.mode === 'chase') {
        zombie.mode = 'investigate';
      }

      let target: Vec3 = zombie.home;
      let direction: Vec3 = [0, 0, 0];
      let desiredSpeed = 0;
      let stroll = zombie.mode === 'stroll';
      if (zombie.mode === 'idle') {
        zombie.modeTimer -= dt;
        zombie.lookTimer -= dt;
        if (zombie.lookTimer <= 0) {
          zombie.bodyLookTarget =
            angleOf(zombie.facing) + rng.range(-type.wander.bodyLookArcDegrees, type.wander.bodyLookArcDegrees) * 0.5 * (Math.PI / 180);
          zombie.headYawTarget =
            rng.range(-type.wander.headLookArcDegrees, type.wander.headLookArcDegrees) * 0.5 * (Math.PI / 180);
          zombie.lookTimer = inRange(rng, type.wander.lookIntervalSeconds);
        }
        zombie.facing = turnToward(
          zombie.facing,
          headingAt(zombie.bodyLookTarget),
          (type.wander.bodyTurnDegreesPerSecond * Math.PI * dt) / 180,
        );
        zombie.headYaw = approachAngle(
          zombie.headYaw,
          zombie.headYawTarget,
          (type.wander.headTurnDegreesPerSecond * Math.PI * dt) / 180,
        );
        if (zombie.modeTimer <= 0) this.beginStroll(zombie);
      } else if (zombie.mode === 'stroll') {
        zombie.modeTimer -= dt;
        direction = zombie.strollHeading;
        desiredSpeed = zombie.modeTimer > 0 ? type.speed.wander : 0;
        zombie.facing = turnToward(
          zombie.facing,
          direction,
          (type.wander.bodyTurnDegreesPerSecond * Math.PI * dt) / 180,
        );
        zombie.headYaw = approachAngle(
          zombie.headYaw,
          0,
          (type.wander.headTurnDegreesPerSecond * Math.PI * dt) / 180,
        );
      } else {
        if (zombie.mode === 'chase') {
          target = player.pos;
        } else if (zombie.mode === 'investigate') {
          target = zombie.lastPerceived ?? zombie.home;
        }
        let metresToTarget = horizontalDistance(target, pos) * blockSize;
        if (zombie.mode === 'investigate' && metresToTarget <= 1) {
          zombie.mode = 'return';
          target = zombie.home;
          metresToTarget = horizontalDistance(target, pos) * blockSize;
        }
        if (zombie.mode === 'return' && metresToTarget < 0.4) {
          this.beginIdle(zombie);
        } else {
          direction = unit([target[0] - pos[0], 0, target[2] - pos[2]]);
          const moving = metresToTarget > (zombie.mode === 'chase' ? type.attack.reach * 0.9 : 0.25);
          if (moving) {
            desiredSpeed = zombie.mode === 'chase' ? type.speed.chase : type.speed.wander;
            zombie.facing = turnToward(
              zombie.facing,
              direction,
              (type.wander.bodyTurnDegreesPerSecond * Math.PI * dt) / 180,
            );
          } else {
            direction = [0, 0, 0];
          }
          zombie.headYaw = approachAngle(
            zombie.headYaw,
            0,
            (type.wander.headTurnDegreesPerSecond * Math.PI * dt) / 180,
          );
        }
      }

      // A stroll remains a stroll while it gently brakes at the end of its interval.
      zombie.horizontalSpeed = approach(
        zombie.horizontalSpeed,
        desiredSpeed,
        type.wander.movementAcceleration * dt,
      );
      zombie.body.vel[0] = (direction[0] * zombie.horizontalSpeed) / blockSize;
      zombie.body.vel[2] = (direction[2] * zombie.horizontalSpeed) / blockSize;
      if (
        zombie.horizontalSpeed > 0.01 &&
        zombie.body.onGround &&
        canJumpObstacle({
          body: zombie.body,
          direction,
          isSolid,
          physics: this.options.physics,
          jumpSpeed: this.options.jumpSpeed,
          blockSize,
        })
      ) {
        zombie.body.vel[1] = this.options.jumpSpeed / blockSize;
      }
      const beforeStep = copy(pos);
      const obstacles = player.body ? [player.body] : [];
      stepBody(zombie.body, dt, isSolid, { ...this.options.physics, obstacles });
      const travelled = horizontalDistance(beforeStep, zombie.body.pos) * blockSize;
      zombie.gaitPhase += (travelled / type.stepLength) * Math.PI;
      if (zombie.mode === 'idle' || zombie.mode === 'stroll') zombie.wanderClock += dt;
      if (stroll && zombie.mode === 'stroll' && zombie.horizontalSpeed > 0.01) {
        const requested = zombie.horizontalSpeed * dt;
        if (travelled + 1e-4 < requested * 0.1) {
          this.beginIdle(zombie);
        }
      }
      if (stroll && zombie.mode === 'stroll' && zombie.modeTimer <= 0 && zombie.horizontalSpeed <= 0.01) {
        this.beginIdle(zombie);
      }

      if (
        zombie.mode === 'chase' &&
        horizontalDistance(player.pos, zombie.body.pos) * blockSize <= type.attack.reach &&
        Math.abs(player.pos[1] - zombie.body.pos[1]) * blockSize < 1.7 &&
        zombie.attackWait <= 0
      ) {
        const chestOffset = 1 / blockSize;
        const zombieChest: Vec3 = [pos[0], pos[1] + chestOffset, pos[2]];
        const playerChest: Vec3 = [player.pos[0], player.pos[1] + chestOffset, player.pos[2]];
        const toPlayer = sub(playerChest, zombieChest);
        const chestDistance = Math.hypot(...toPlayer);
        if (chestDistance > 0 && raycast(zombieChest, unit(toPlayer), chestDistance, isSolid) === undefined) {
          this.options.hurtPlayer(type.attack.damage);
          zombie.attackWait = type.attack.cooldown;
        }
      }
      if (zombie.mode === 'return' && horizontalDistance(zombie.home, zombie.body.pos) * blockSize < 0.4) {
        this.beginIdle(zombie);
        zombie.lastPerceived = undefined;
      }
    }
    separateBodies({ bodies: entries.map(([, zombie]) => zombie.body), dt, isSolid, blockSize, obstacles: player.body ? [player.body] : [] });
    if (player.body) {
      for (const [, zombie] of entries) {
        separateBodyPair({ first: player.body, second: zombie.body, dt, isSolid, blockSize });
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
