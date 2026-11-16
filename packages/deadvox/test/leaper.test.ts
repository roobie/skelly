import { requireDayCycle } from '@skelly/engine/content';
import { actorHobbled, pounceClipOf } from '@skelly/engine/internal/core/actorPose.ts';
import { posedHumanoidRegionBoxes } from '@skelly/engine/internal/core/actorRegions.ts';
import { actorPoseInputFor } from '@skelly/engine/pose';
import { dayPhaseAt, type PlayerSense } from '@skelly/engine/sim';
import { makeScale, type SolidAt, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { startupContent } from './baseRegistry.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const { registry } = startupContent();
const LEAPER = registry.actors.get('leaper')!;
const POUNCE = LEAPER.pounce!;
const FIGURES = stackActorFigureFiles(registry);
const DAY_CYCLE = requireDayCycle(registry);
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const POSE_SCENE = { blockSize: BLOCK_SIZE, actorFigureFiles: FIGURES };
const FLOOR: SolidAt = (_x, y) => y === 0;
const FRAME = 1 / 60;

const PLAYER_POS: Vec3 = [0, 1, 0];
const inBand = (POUNCE.rangeBand.nearMetres + POUNCE.rangeBand.farMetres) / 2 / BLOCK_SIZE;

const sensed = (): PlayerSense => ({
  pos: PLAYER_POS,
  facing: [1, 0, 0],
  movement: 'still',
  lit: false,
  lightSeenFrom: 40,
  eyeHeightMetres: 1.3,
  stance: 'standing',
});

interface Hurt {
  readonly damage: number;
  readonly pounceSimSecondsBefore: number | undefined;
}

const harness = () => {
  const hurts: Hurt[] = [];
  let pounceSimSecondsBefore: number | undefined;
  const system = new ActorSystem({
    player: sensed,
    isSolid: FLOOR,
    isOpaque: FLOOR,
    dayPhase: () => dayPhaseAt(DAY_CYCLE, 12 * 3600),
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: FIGURES,
    hurtPlayer: ({ damage }) => {
      hurts.push({ damage, pounceSimSecondsBefore });
    },
  });
  const id = system.add({ ...LEAPER, dismember: { chance: 0, headOnKillChance: 0 } }, [inBand, 1, 0], [-1, 0, 0]);
  const actor = system.store.get(id)!;
  const tick = (): void => {
    pounceSimSecondsBefore = actor.pounceSimSeconds;
    system.tick(FRAME);
  };
  return { system, id, actor, hurts, tick };
};

describe('leaper', () => {
  it('lands its pounce on the player only in the tick its clip reaches the hit time', () => {
    const { actor, hurts, tick, system } = harness();
    const clip = pounceClipOf(system.figureFor(actor.type, actor.figureSeed));
    let started = false;
    for (let frame = 0; frame < 600 && !(started && actor.pounceSimSeconds === undefined); frame++) {
      tick();
      started ||= actor.pounceSimSeconds !== undefined;
    }
    expect(started).toBe(true);
    const pounceHits = hurts.filter((hurt) => hurt.pounceSimSecondsBefore !== undefined);
    expect(pounceHits).toHaveLength(1);
    const before = pounceHits[0]!.pounceSimSecondsBefore!;
    expect(before).toBeLessThan(clip.hitAtSimSeconds!);
    expect(before + FRAME).toBeGreaterThanOrEqual(clip.hitAtSimSeconds!);
    expect(actor.pounceWait).toBeGreaterThan(0);
  });

  it('cannot pounce once a hind leg is cut', () => {
    const { actor, id, system, tick } = harness();
    actor.agent!.modeTimer = 1000;
    const weapon = { ...FISTS_MELEE, cooldown: 0 };
    const hits = Math.ceil(actor.regions.leftLeg! / weapon.damage);
    for (let hit = 0; hit < hits; hit++) {
      const [box] = posedHumanoidRegionBoxes(actorPoseInputFor(actor, id, POSE_SCENE)).leftLeg;
      const { center } = box!;
      const outward = Math.hypot(center[0] - actor.body.pos[0], center[2] - actor.body.pos[2]);
      const out: Vec3 = [(center[0] - actor.body.pos[0]) / outward, 0, (center[2] - actor.body.pos[2]) / outward];
      const origin: Vec3 = [center[0] + out[0] / BLOCK_SIZE, center[1], center[2] + out[2] / BLOCK_SIZE];
      expect(system.swing(origin, [-out[0], 0, -out[2]], weapon)).toBe(id);
    }
    const { body } = system.figureFor(actor.type, actor.figureSeed);
    expect(actorPoseInputFor(actor, id, POSE_SCENE).lostLegs).toEqual({ left: true, right: false });
    expect(actorHobbled(actor, body)).toBe(true);
    let pounced = false;
    for (let frame = 0; frame < 600; frame++) {
      tick();
      pounced ||= actor.pounceSimSeconds !== undefined;
    }
    expect(pounced).toBe(false);
  });
});
