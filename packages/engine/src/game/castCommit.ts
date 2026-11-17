// The one place a cast is paid for. A live release and a replayed one both arrive here at the player tick, so a
// cast pays, practises and schedules once whichever path carried it (`packages/deadvox/docs/magic-mod.md`, "6. Spells").

import { resolveAbilityCost } from '../core/abilities.ts';
import { actionText, fillText } from '../core/actionText.ts';
import { CastRuleError, type CastRuleEvent, type ProjectileVolleyRequest, resolveCastRule } from '../core/castRules.ts';
import type { Character } from '../core/character.ts';
import type { Registry } from '../core/content.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';

/**
 * Why a cast did not happen. `source`: the captured item is no longer in the captured hand casting that ability;
 * `hand`: a ladder holds that hand; `unknown`: the caster does not know the ability; `unprepared`: released before
 * preparation ended; `unaffordable`: the pool cannot pay; `invalid`: content resolved to a value the engine refuses;
 * `fizzled`: the rule's condition produced no effect, so nothing is paid.
 */
export type CastRefusal = 'source' | 'hand' | 'unknown' | 'unprepared' | 'unaffordable' | 'invalid' | 'fizzled';

/** The caster id cast rules see for the player, the only caster a session commits for. */
export const PLAYER_CASTER_ID = 'player';

/** A released cast as captured at release; origin is in blocks, aim a unit vector. */
export interface CastAttempt {
  readonly casterId: string;
  readonly abilityId: string;
  readonly sourceItemUid: number;
  readonly hand: HandSide;
  readonly origin: CastRuleEvent['origin'];
  readonly aim: CastRuleEvent['aim'];
  readonly heldSimSeconds: number;
}

export type CastResult =
  | { readonly kind: 'accepted'; readonly requests: readonly ProjectileVolleyRequest[]; readonly cost: number }
  | { readonly kind: 'refused'; readonly refusal: CastRefusal };

export interface CastCommitPorts {
  readonly registry: Registry;
  readonly character: Pick<Character, 'knowsAbility' | 'abilityLevel' | 'canSpend' | 'spend' | 'awardAbilityPractice'>;
  readonly inventory: Pick<Inventory, 'hands'>;
  readonly handRefusal: (hand: HandSide) => string | undefined;
  readonly schedule: (requests: readonly ProjectileVolleyRequest[]) => void;
}

/** The ability an item casts, if any. */
export const castingAbility = (registry: Registry, item: Pick<Item, 'type'> | undefined): string | undefined =>
  item ? registry.items.get(item.type)?.casting?.ability : undefined;

/** What the caster says about a refusal; one that cannot pay names the ability's pool. */
export const castRefusalText = (registry: Registry, refusal: CastRefusal, abilityId: string): string => {
  const lines = actionText(registry).cast;
  if (refusal !== 'unaffordable') {
    return lines[refusal];
  }
  const { pool } = registry.abilities.get(abilityId)!.cost;
  return fillText(lines.unaffordable, { pool: registry.pools.get(pool)!.name.toLowerCase() });
};

const refused = (refusal: CastRefusal): CastResult => ({ kind: 'refused', refusal });

/** The cost at the caster's current level, or the refusal that cost earns. */
const affordableCost = (
  { registry, character }: Pick<CastCommitPorts, 'registry' | 'character'>,
  event: CastRuleEvent,
): number | CastRefusal => {
  let cost: number;
  try {
    cost = resolveAbilityCost(registry, event);
  } catch (error) {
    if (error instanceof CastRuleError) {
      return 'invalid';
    }
    throw error;
  }
  return character.canSpend(registry.abilities.get(event.abilityId)!.cost.pool, cost) ? cost : 'unaffordable';
};

const eventOf = (attempt: Omit<CastAttempt, 'heldSimSeconds'>, abilityLevel: number): CastRuleEvent => ({
  casterId: attempt.casterId,
  abilityId: attempt.abilityId,
  sourceItemUid: attempt.sourceItemUid,
  hand: attempt.hand,
  abilityLevel,
  origin: { ...attempt.origin },
  aim: { ...attempt.aim },
});

/**
 * A press's advice: whether the cast could be paid now, so a cast that cannot happen never starts preparing. The
 * commit decides again, since level, pool and source can all change while the cast prepares.
 */
export const castPrecheck = (
  ports: Pick<CastCommitPorts, 'registry' | 'character'>,
  attempt: Omit<CastAttempt, 'heldSimSeconds'>,
): CastRefusal | undefined => {
  if (!ports.character.knowsAbility(attempt.abilityId)) {
    return 'unknown';
  }
  const cost = affordableCost(ports, eventOf(attempt, ports.character.abilityLevel(attempt.abilityId)));
  return typeof cost === 'number' ? undefined : cost;
};

/**
 * Revalidates the whole cast, then pays, practises and schedules exactly once. Every refusal comes before the
 * first change, so a refused cast leaves pool, practice and world untouched. The rule reads the level from before
 * this cast's practice, so the cast that earns a level is still cast at the old one.
 */
export const commitCast = (ports: CastCommitPorts, attempt: CastAttempt): CastResult => {
  const { registry, character } = ports;
  const item = ports.inventory.hands[attempt.hand];
  if (item?.uid !== attempt.sourceItemUid || castingAbility(registry, item) !== attempt.abilityId) {
    return refused('source');
  }
  if (ports.handRefusal(attempt.hand) !== undefined) {
    return refused('hand');
  }
  if (!character.knowsAbility(attempt.abilityId)) {
    return refused('unknown');
  }
  const ability = registry.abilities.get(attempt.abilityId)!;
  if (!(attempt.heldSimSeconds >= ability.preparationSimSeconds)) {
    return refused('unprepared');
  }
  const event = eventOf(attempt, character.abilityLevel(attempt.abilityId));
  const cost = affordableCost(ports, event);
  if (typeof cost !== 'number') {
    return refused(cost);
  }
  let requests: ProjectileVolleyRequest[];
  try {
    requests = resolveCastRule(registry, ability.rule, event);
  } catch (error) {
    if (error instanceof CastRuleError) {
      return refused('invalid');
    }
    throw error;
  }
  if (requests.length === 0) {
    return refused('fizzled');
  }
  if (!character.spend(ability.cost.pool, cost)) {
    throw new Error(`Pool ${ability.cost.pool} refused a cost it could pay`);
  }
  character.awardAbilityPractice(attempt.abilityId);
  ports.schedule(requests);
  return { kind: 'accepted', requests, cost };
};
