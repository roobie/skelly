import { describe, expect, it, vi } from 'vitest';
import { resolveAbilityCost } from '../src/core/abilities.ts';
import { Character, dominantSide, offSide } from '../src/core/character.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import { type HandSide, Inventory } from '../src/core/inventory.ts';
import { ItemFactory } from '../src/core/items.ts';
import { CastCharge } from '../src/game/castCharge.ts';
import {
  type CastAttempt,
  type CastRefusal,
  type CastResult,
  castPrecheck,
  commitCast,
} from '../src/game/castCommit.ts';
import { FIXTURE_SHOT_LOOK } from './fixtures/shotLook.ts';

const POOL = 'fixture_mana';
const BOLT = 'fixture_bolt';
const DUD = 'fixture_dud';
const BROKEN = 'fixture_broken';
const UNGRANTED = 'fixture_ungranted';
const WAND = 'fixture_wand';
const PREPARATION = 0.5;
const LADDER = 'Both hands are on the ladder.';

const volley = (count: string) => ({
  verb: 'projectileVolley',
  count,
  damage: 'double(abilityLevel) + 1.0',
  intervalSimSeconds: '0.1',
  speedMetresPerSimSecond: '10.0',
  rangeMetres: '10.0',
  damageKind: 'fixture_arcane',
});

const ability = (id: string, rule: string) => ({
  id,
  name: id,
  rule,
  targeting: 'aimed',
  preparationSimSeconds: PREPARATION,
  cost: { pool: POOL, amount: 'double(abilityLevel) + 2.0' },
  projectile: FIXTURE_SHOT_LOOK,
  progression: { maximumLevel: 1000, practicePerCast: 1, practicePerLevel: 1 },
});

const item = (id: string, casts?: string) => ({
  id,
  name: id,
  category: 'misc',
  size: [1, 1],
  weight: 1,
  workInProgress: false,
  ...(casts ? { casting: { ability: casts } } : {}),
});

const registry: Registry = (() => {
  const built = buildRegistry([
    {
      source: 'cast.json',
      data: {
        damageKinds: [{ id: 'fixture_arcane', class: 'non-melee' }],
        inventory: [
          {
            id: 'fixture_inventory',
            capability: 'player',
            conditionBands: [{ from: 0, word: 'whole', color: '#ffffff' }],
            repairCeiling: 'whole',
            cellMetres: 1,
            containerMaxWidthCells: 8,
            keyHoldRealSeconds: 1,
            handling: { perCellSimSeconds: 0, groundSimSeconds: 0, wearSimSeconds: 0, attributes: {}, skills: {} },
            groundPileStateCap: 8,
            autoPlacementTallMinFreeAreaGainCells: 0,
            reachMetres: 1,
            chestHeightMetres: 1,
            useReachMetres: 1,
            search: { minSimSeconds: 0, maxSimSeconds: 0, cellsForMax: 1 },
            throwFlightSimSeconds: 1,
            throwDrag: { airDensityKgPerCubicMetre: 0, footprintDragCoefficient: 0 },
            furnitureMove: {
              lift: { averageKg: 1, attributes: {} },
              fatigue: {
                lift: { base: 0, perKg: 0 },
                drag: { base: 0, perKg: 0 },
                carry: { basePerSimSecond: 1, perKgPerSimSecond: 1 },
              },
              slide: { stepSimSeconds: 1 },
              carriedView: { offsetMetres: [0, 0, 0], sizeMetres: 1, bobMetres: 0, bobPerRealSecond: 0 },
            },
          },
        ],
        rules: [
          // Two effects, the first of several shots, so one cast schedules more than one volley and launch.
          { id: 'fixture_volleys', trigger: { event: 'cast' }, effects: [volley('3'), volley('2')] },
          { id: 'fixture_fizzle', trigger: { event: 'cast' }, condition: 'false', effects: [volley('1')] },
          { id: 'fixture_overflow', trigger: { event: 'cast' }, effects: [{ ...volley('1'), damage: '-1.0' }] },
        ],
        pools: [{ id: POOL, name: 'Fixture mana', maximum: 20, recoveryPerGameHour: 1 }],
        abilities: [
          ability(BOLT, 'fixture_volleys'),
          ability(DUD, 'fixture_fizzle'),
          ability(BROKEN, 'fixture_overflow'),
          ability(UNGRANTED, 'fixture_volleys'),
        ],
        items: [
          item(WAND, BOLT),
          item('fixture_dud_wand', DUD),
          item('fixture_broken_wand', BROKEN),
          item('fixture_ungranted_wand', UNGRANTED),
          item('fixture_stick'),
        ],
      },
    },
  ]);
  if (built.issues.length > 0) {
    throw new Error(`Cast fixture did not admit: ${JSON.stringify(built.issues)}`);
  }
  return built.registry;
})();

const caster = ({ handedness = 'right' as HandSide, ladderHand = undefined as HandSide | undefined } = {}) => {
  const character = new Character(registry, { handedness });
  character.initializeMagic({
    abilities: [BOLT, DUD, BROKEN].map((id) => ({ ability: id, level: 0 })),
    pools: [{ pool: POOL }],
  });
  const factory = new ItemFactory();
  const inventory = new Inventory(registry, factory, undefined, character);
  const ladder = { refusal: (hand: HandSide) => (hand === ladderHand ? LADDER : undefined) };
  const schedule = vi.fn();
  const ports = { registry, character, inventory, handRefusal: ladder.refusal, schedule };
  const drop = (hand: HandSide) => {
    const held = inventory.hands[hand];
    if (held && !inventory.move(held, { kind: 'pile', pos: [0, 0, 0] }).ok) {
      throw new Error('Fixture caster could not drop the held item');
    }
  };
  const hold = (hand: HandSide, type = WAND) => {
    drop(hand);
    const held = inventory.create(type);
    if (!inventory.add(held, { kind: 'hand', side: hand })) {
      throw new Error('Fixture caster could not hold the item');
    }
    return held;
  };
  return { character, inventory, ports, schedule, hold, drop, charge: new CastCharge(registry, inventory, ladder) };
};

const attempt = (overrides: Partial<CastAttempt> = {}): CastAttempt => ({
  casterId: 'player',
  abilityId: BOLT,
  sourceItemUid: 1,
  hand: 'right',
  origin: { x: 0.5, y: 1.5, z: 0.5 },
  aim: { x: 0, y: 0, z: 1 },
  heldSimSeconds: PREPARATION,
  ...overrides,
});

/** Prepares and releases a cast from `hand`, committing it with the ray `attempt` supplies. */
const castFrom = (setup: ReturnType<typeof caster>, hand: HandSide, releaseAt = PREPARATION): CastResult => {
  const started = setup.charge.begin(hand, 0, false);
  const release = setup.charge.release(releaseAt);
  if (!release) {
    throw new Error(`Fixture cast did not prepare: ${started.kind}`);
  }
  return commitCast(
    setup.ports,
    attempt({
      abilityId: release.abilityId,
      sourceItemUid: release.itemUid,
      hand: release.hand,
      heldSimSeconds: release.heldSimSeconds,
    }),
  );
};

describe('retained casting', () => {
  it.each([
    ['right', 'dominant'],
    ['right', 'off'],
    ['left', 'dominant'],
    ['left', 'off'],
  ] as const)(
    'a %s-handed caster casts from the %s hand without the item leaving it or being thrown',
    (handedness, side) => {
      const setup = caster({ handedness });
      const hand = (side === 'dominant' ? dominantSide : offSide)(setup.character);
      const source = setup.hold(hand);
      const thrown = vi.spyOn(setup.inventory, 'throwToPile');
      expect(castFrom(setup, hand).kind).toBe('accepted');
      expect(setup.inventory.hands[hand]).toBe(source);
      expect(thrown).not.toHaveBeenCalled();
    },
  );

  it('an accepted cast pays its resolved cost and practises once, however many volleys and shots it makes', () => {
    const setup = caster();
    setup.hold('right');
    const before = setup.character.poolAmount(POOL)!;
    const cost = resolveAbilityCost(registry, { ...attempt(), abilityLevel: 0 });
    const result = castFrom(setup, 'right');
    expect(result).toMatchObject({ kind: 'accepted', cost });
    const { requests } = result as Extract<CastResult, { kind: 'accepted' }>;
    expect(requests.map(({ count }) => count)).toEqual([3, 2]);
    expect(setup.character.poolAmount(POOL)).toBe(before - cost);
    expect(setup.character.abilityLevel(BOLT)).toBe(1);
    expect(setup.schedule).toHaveBeenCalledOnce();
    expect(setup.schedule).toHaveBeenCalledWith(requests);
  });

  it('scales the cast by the level it had before the practice that cast earns', () => {
    const setup = caster();
    setup.hold('right');
    const result = castFrom(setup, 'right') as Extract<CastResult, { kind: 'accepted' }>;
    expect(result.requests.every(({ abilityLevel }) => abilityLevel === 0)).toBe(true);
    expect(setup.character.abilityLevel(BOLT)).toBe(1);
  });

  type Setup = ReturnType<typeof caster>;
  const castWith = (type: string, abilityId: string) => (setup: Setup) => ({
    abilityId,
    sourceItemUid: setup.hold('right', type).uid,
  });
  const unable = (refusal: CastRefusal): CastResult => ({ kind: 'unable', refusal });
  const refusals: [string, CastResult, (setup: Setup) => Partial<CastAttempt>, Parameters<typeof caster>[0]?][] = [
    [
      'source switched',
      unable('source'),
      ({ hold }) => {
        hold('right');
        return {};
      },
    ],
    [
      'source removed',
      unable('source'),
      ({ drop }) => {
        drop('right');
        return {};
      },
    ],
    [
      'source moved to the other hand',
      unable('source'),
      ({ inventory }) => {
        if (!inventory.move(inventory.hands.right!, { kind: 'hand', side: 'left' }).ok) {
          throw new Error('Fixture caster could not move the focus to the other hand');
        }
        return {};
      },
    ],
    ['hand taken by a ladder', { kind: 'refused', reason: LADDER }, () => ({}), { ladderHand: 'right' }],
    ['ability not known', unable('unknown'), castWith('fixture_ungranted_wand', UNGRANTED)],
    ['release before preparation ended', unable('unprepared'), () => ({ heldSimSeconds: PREPARATION / 2 })],
    [
      'pool too low',
      unable('unaffordable'),
      ({ character }) => {
        character.spend(POOL, character.poolAmount(POOL)!);
        return {};
      },
    ],
    ['condition producing nothing', unable('fizzled'), castWith('fixture_dud_wand', DUD)],
    ['content resolving out of bounds', unable('invalid'), castWith('fixture_broken_wand', BROKEN)],
  ];

  it.each(refusals)('refuses a cast with its %s and changes nothing', (_case, refused, arrange, options) => {
    const setup = caster(options);
    const source = setup.hold('right');
    const overrides = arrange(setup);
    const pool = setup.character.poolAmount(POOL);
    const result = commitCast(setup.ports, attempt({ sourceItemUid: source.uid, ...overrides }));
    expect(result).toEqual(refused);
    expect(setup.character.poolAmount(POOL)).toBe(pool);
    expect([BOLT, DUD, BROKEN].map((id) => setup.character.abilityLevel(id))).toEqual([0, 0, 0]);
    expect(setup.schedule).not.toHaveBeenCalled();
  });

  it('a press refuses a cast the caster does not know or cannot pay for', () => {
    const setup = caster();
    expect(castPrecheck(setup.ports, attempt())).toBeUndefined();
    expect(castPrecheck(setup.ports, attempt({ abilityId: UNGRANTED }))).toBe('unknown');
    setup.character.spend(POOL, setup.character.poolAmount(POOL)!);
    expect(castPrecheck(setup.ports, attempt())).toBe('unaffordable');
  });
});

describe('cast preparation', () => {
  it('a release before preparation ends cancels the cast', () => {
    const { charge, hold } = caster();
    hold('right');
    charge.begin('right', 0, false);
    expect(charge.ready(PREPARATION / 2)).toBe(false);
    expect(charge.release(PREPARATION / 2)).toBeUndefined();
    expect(charge.active).toBe(false);
  });

  it('a prepared cast holds, and a much later release casts exactly as a prompt one', () => {
    const prompt = caster();
    const late = caster();
    prompt.hold('right');
    late.hold('right');
    late.charge.begin('right', 0, false);
    expect(late.charge.ready(PREPARATION * 40)).toBe(true);
    expect(late.charge.progress(PREPARATION * 40)).toBe(1);
    late.charge.cancel();
    const results = [castFrom(prompt, 'right'), castFrom(late, 'right', PREPARATION * 40)];
    expect(results[0]!.kind).toBe('accepted');
    expect(results[1]).toEqual(results[0]);
    expect(late.character.poolAmount(POOL)).toBe(prompt.character.poolAmount(POOL));
  });

  it('waits for busy handling, and never starts once its item has left the hand', () => {
    const { charge, hold, drop } = caster();
    hold('right');
    expect(charge.begin('right', 0, true)).toEqual({ kind: 'waiting' });
    expect(charge.startedAtSimSeconds).toBeUndefined();
    expect(charge.begin('right', 0, false)).toEqual({ kind: 'held' });
    drop('right');
    expect(charge.start(1)).toBe(false);
    expect(charge.active).toBe(false);
  });

  it('ends a preparing cast when its item leaves the hand or a ladder takes the hand', () => {
    const left = caster();
    left.hold('right');
    left.charge.begin('right', 0, false);
    expect(left.charge.cancelIfSourceLeft()).toBe(false);
    left.hold('right');
    expect(left.charge.cancelIfSourceLeft()).toBe(true);
    expect(left.charge.active).toBe(false);
    let ladderHand: HandSide | undefined;
    const climbing = caster();
    climbing.hold('right');
    const charge = new CastCharge(registry, climbing.inventory, {
      refusal: (hand) => (hand === ladderHand ? LADDER : undefined),
    });
    charge.begin('right', 0, false);
    ladderHand = 'right';
    expect(charge.refuseForLadder()).toBe(LADDER);
    expect(charge.active).toBe(false);
  });

  it('a press with nothing that casts in the hand starts nothing', () => {
    const { charge, hold } = caster();
    expect(charge.begin('right', 0, false)).toEqual({ kind: 'empty' });
    hold('right', 'fixture_stick');
    expect(charge.begin('right', 0, false)).toEqual({ kind: 'empty' });
    expect(charge.active).toBe(false);
  });
});
