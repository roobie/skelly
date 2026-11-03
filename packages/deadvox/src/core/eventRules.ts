import type { ActorSystem } from './actorSystem.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { DayPhase } from './dayPhase.ts';
import type { ScenarioRun } from './scenarioRun.ts';
import type { EventRuleDef } from './schema.ts';

export interface EventRuleAdvance {
  rules: readonly EventRuleDef[];
  run: ScenarioRun;
  calendar: number;
  dayPhase: DayPhase;
  /** Where the player stands; a released horde heads here. */
  player: Readonly<Vec3>;
  registry: Pick<Registry, 'actors'>;
  actors: Pick<ActorSystem, 'releaseHorde'>;
}

/**
 * Fires each due rule once, in authored order. Only the calendar and the run's saved firing record decide
 * firing, never column loading or rendering (`docs/decisions/0008-deterministic-world.md`, "Decision").
 */
export const advanceEventRules = ({ rules, run, calendar, dayPhase, player, registry, actors }: EventRuleAdvance) => {
  if (run.won) {
    return;
  }
  for (const rule of rules) {
    if (
      run.fired(rule.id) ||
      calendar - run.startedAt < rule.trigger.afterGameHours ||
      !rule.conditions.every((condition) => condition.phases.includes(dayPhase))
    ) {
      continue;
    }
    run.fire(rule.id, calendar);
    rule.effects.forEach((effect, index) => {
      const type = registry.actors.get(effect.zombie);
      if (!type) {
        throw new Error(`Event rule ${rule.id} names no zombie type "${effect.zombie}"`);
      }
      actors.releaseHorde(`event:${rule.id}:${index}`, type, {
        center: [...effect.at],
        count: effect.count,
        target: [...player],
      });
    });
  }
};
