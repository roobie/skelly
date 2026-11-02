import { describe, expect, it, vi } from 'vitest';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ZombieDef } from '../src/core/schema.ts';
import { simRate } from '../src/core/time.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureIds as CORE_CONTENT_IDS } from './fixtures/capabilityIds.ts';

const registry = baseRegistry();
const FLAT: SolidAt = (_x, y) => y === 0;
const shambler = registry.zombies.get('shambler')!;
const move: ZombieDef['attack']['moves'][number] = {
  id: 'fixture-hit',
  motion: 'swing',
  weight: 1,
  damage: 12,
  damageKind: 'blunt',
  hitRegions: [{ region: 'leftArm', weight: 1 }],
};
const attacker: ZombieDef = { ...shambler, attack: { ...shambler.attack, moves: [move] } };
const meleeSkill = registry.skills.get(CORE_CONTENT_IDS.meleeCombat)!;
const playerBody = registry.body.get('player')!;

/** Pins the full-block roll's outcome by making the full-block chance 0 or 1 at every skill level. */
const withFullBlockChance = (chance: number, content = registry) => ({
  ...content,
  skills: new Map([
    ...content.skills,
    [
      CORE_CONTENT_IDS.meleeCombat,
      {
        ...meleeSkill,
        combat: {
          ...meleeSkill.combat,
          melee: { ...meleeSkill.combat!.melee!, blockChanceMinimum: chance, blockChanceRange: 0 },
        },
      },
    ],
  ]),
});

/** A player who starts winded and stays so for the whole fixture, as after a long sprint. */
const winded = {
  ...registry,
  body: new Map([
    [
      'player',
      {
        ...playerBody,
        needs: {
          ...playerBody.needs,
          spawn: { ...playerBody.needs.spawn, stamina: 0 },
          stamina: { ...playerBody.needs.stamina, recoverPerSimSecond: simRate(0.001) },
        },
      },
    ],
  ]),
};

const strike = ({ content = registry, blocking = true, seed = 73 } = {}) => {
  const sounds: string[] = [];
  const blocks: { jolt: number; full: boolean }[] = [];
  const session = createSession({
    registry: content,
    world: new World(),
    isSolid: FLAT,
    isOpaque: FLAT,
    scale: makeScale(0.5),
    seed,
    start: 43_200,
    spawn: [0, 1, 0],
    ready: () => true,
    controls: {
      active: () => true,
      blocking: () => blocking,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: {
      play: ({ event }) => {
        sounds.push(event);
      },
    },
    notice: () => undefined,
    refusal: () => undefined,
    onRead: () => undefined,
    onBlock: (jolt, full) => {
      blocks.push({ jolt: jolt.strength, full });
    },
  });
  session.sim.paused = false;
  session.zombies.add(attacker, [1.2, 1, 0], [-1, 0, 0]);
  const hit = vi.spyOn(session.sim, 'hit');
  const maxFrames = Math.ceil((attacker.attack.windupSimSeconds + 2) * 60);
  for (let frame = 0; frame < maxFrames && hit.mock.calls.length === 0 && blocks.length === 0; frame++) {
    session.frame(1 / 60);
  }
  return {
    hits: hit.mock.calls.map(([damage, , region, effects]) => ({ damage, region, effects })),
    causes: hit.mock.calls.map(([, cause]) => cause),
    blockSounds: sounds.filter((event) => event.startsWith('player_block_')),
    blocks,
    stamina: session.sim.needs.stamina,
    practice: session.character.practice[CORE_CONTENT_IDS.meleeCombat] ?? 0,
  };
};

describe('melee blocking in a session', () => {
  it('passes a partial block’s leftover to the same region and kind, paid for in stamina', () => {
    const open = strike({ content: withFullBlockChance(0), blocking: false });
    const guarded = strike({ content: withFullBlockChance(0) });
    expect(open.hits).toEqual([{ damage: move.damage, region: 'leftArm', effects: { kind: 'blunt' } }]);
    expect(open.causes).toEqual([attacker.cause]);
    expect(guarded.hits).toHaveLength(1);
    expect(guarded.hits[0]!.damage).toBeGreaterThan(0);
    expect(guarded.hits[0]!.damage).toBeLessThan(move.damage);
    expect(guarded.hits[0]).toMatchObject({ region: 'leftArm', effects: { kind: 'blunt' } });
    expect(guarded.stamina).toBeLessThan(open.stamina);
    expect(guarded.practice).toBeGreaterThan(open.practice);
    expect(guarded.blockSounds).toEqual(['player_block_partial']);
    expect(guarded.blocks).toHaveLength(1);
    expect(guarded.blocks[0]!.full).toBe(false);
    expect(guarded.blocks[0]!.jolt).toBeGreaterThan(0);
  });

  it('stops the whole blow on a full block, with its own sound', () => {
    const guarded = strike({ content: withFullBlockChance(1) });
    expect(guarded.hits).toEqual([]);
    expect(guarded.blockSounds).toEqual(['player_block_full']);
    expect(guarded.blocks.map(({ full }) => full)).toEqual([true]);
  });

  it('absorbs nothing while winded, even when the roll would be a full block', () => {
    const guarded = strike({ content: withFullBlockChance(1, winded) });
    expect(guarded.hits).toEqual([{ damage: move.damage, region: 'leftArm', effects: { kind: 'blunt' } }]);
    expect(guarded.blockSounds).toEqual([]);
    expect(guarded.blocks).toEqual([]);
  });

  it('repeats the same block outcome for the same seed', () => {
    const first = strike({ seed: 91 });
    expect(first.blocks).toHaveLength(1);
    expect(strike({ seed: 91 })).toEqual(first);
  });
});
