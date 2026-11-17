import type { ContentIssue, Registry } from './content.ts';
import type { HandSide } from './inventory.ts';
import {
  type CheckedRuleExpression,
  compileRuleExpression,
  type RuleScalar,
  type RuleScalarType,
} from './ruleExpressions.ts';
import { CAST_RULE_LIMITS, type RuleDef, VOLLEY_ARGUMENTS, type VolleyArgument } from './schema/rules.ts';
import { type SimRate, type SimSeconds, simRate, simSeconds } from './time.ts';

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
export interface CastRuleEvent {
  readonly casterId: string;
  readonly abilityId: string;
  readonly sourceItemUid: number;
  readonly hand: HandSide;
  readonly abilityLevel: number;
  readonly origin: Point;
  readonly aim: Point;
}
export interface ProjectileVolleyRequest extends CastRuleEvent {
  readonly verb: 'projectileVolley';
  readonly count: number;
  readonly intervalSimSeconds: SimSeconds;
  readonly speedMetresPerSimSecond: SimRate;
  readonly rangeMetres: number;
  readonly damage: number;
  readonly damageKind: string;
}
interface CompiledExpression {
  readonly path: string;
  readonly program: CheckedRuleExpression;
}
interface CompiledRule {
  readonly condition: CompiledExpression | undefined;
  readonly effects: readonly {
    readonly damageKind: string;
    readonly arguments: Record<VolleyArgument, CompiledExpression>;
  }[];
}
const compiledRules = new WeakMap<Registry, ReadonlyMap<string, CompiledRule>>();

export class CastRuleError extends Error {
  readonly issue: ContentIssue;
  constructor(issue: ContentIssue) {
    super(`${issue.source}: ${issue.path}: ${issue.message}`);
    this.name = 'CastRuleError';
    this.issue = issue;
  }
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const compile = (registry: Registry, rule: RuleDef, issues: ContentIssue[]): CompiledRule | undefined => {
  const origin = registry.contentOrigins.get(`rules:${rule.id}`)!;
  let work = 0;
  const issue = (path: string, message: string) =>
    issues.push({ source: origin.source, path: origin.path + path, message });
  const expression = (source: string, type: RuleScalarType, path: string): CompiledExpression | undefined => {
    try {
      const program = compileRuleExpression(source, type);
      work += program.work;
      return { path, program };
    } catch (error) {
      issue(path, errorMessage(error));
      return undefined;
    }
  };
  const condition = rule.condition === undefined ? undefined : expression(rule.condition, 'bool', '.condition');
  const effects = rule.effects.map((effect, index) => {
    const path = `.effects[${index}]`;
    if (!registry.damageKinds.has(effect.damageKind)) {
      issue(`${path}.damageKind`, `no damage kind "${effect.damageKind}"`);
    }
    const args = Object.fromEntries(
      Object.entries(VOLLEY_ARGUMENTS).map(([field, descriptor]) => [
        field,
        expression(effect[field as VolleyArgument], descriptor.type, `${path}.${field}`),
      ]),
    );
    return { damageKind: effect.damageKind, arguments: args as Record<VolleyArgument, CompiledExpression> };
  });
  if (work > CAST_RULE_LIMITS.expressionWork) {
    issue('', 'rule exceeds total expression work reservation');
  }
  return issues.some((entry) => entry.source === origin.source && entry.path.startsWith(origin.path))
    ? undefined
    : { condition, effects };
};

/** Compilation is required even for stamped bundles: a stamp does not supply executable programs. */
export const castRuleIssues = (registry: Registry): ContentIssue[] => {
  const issues: ContentIssue[] = [];
  const programs = new Map<string, CompiledRule>();
  for (const rule of registry.rules.values()) {
    const program = compile(registry, rule, issues);
    if (program) {
      programs.set(rule.id, program);
    }
  }
  compiledRules.set(registry, programs);
  return issues;
};

/** The checked scalars every cast expression reads; throws when the event is not one a cast can carry. */
export const castRuleContext = (event: CastRuleEvent): Record<string, RuleScalar> => {
  if (!Number.isSafeInteger(event.abilityLevel) || event.abilityLevel < 0) {
    throw new Error('invalid cast ability level');
  }
  if (event.hand !== 'left' && event.hand !== 'right') {
    throw new Error('invalid cast hand');
  }
  if (!Number.isSafeInteger(event.sourceItemUid) || event.sourceItemUid < 0) {
    throw new Error('invalid cast source item uid');
  }
  if (![event.casterId, event.abilityId].every((id) => typeof id === 'string' && id.length > 0)) {
    throw new Error('invalid cast source identity');
  }
  const coordinates = [event.origin.x, event.origin.y, event.origin.z, event.aim.x, event.aim.y, event.aim.z];
  if (!coordinates.every(Number.isFinite) || Math.abs(Math.hypot(event.aim.x, event.aim.y, event.aim.z) - 1) > 1e-9) {
    throw new Error('cast requires a finite origin and unit aim');
  }
  return {
    casterId: event.casterId,
    abilityId: event.abilityId,
    sourceItemUid: BigInt(event.sourceItemUid),
    hand: event.hand,
    abilityLevel: BigInt(event.abilityLevel),
    originX: event.origin.x,
    originY: event.origin.y,
    originZ: event.origin.z,
    aimX: event.aim.x,
    aimY: event.aim.y,
    aimZ: event.aim.z,
  };
};

/** Pure resolution publishes nothing until every argument of every effect has passed. */
export const resolveCastRule = (registry: Registry, id: string, event: CastRuleEvent): ProjectileVolleyRequest[] => {
  const origin = registry.contentOrigins.get(`rules:${id}`);
  const rule = compiledRules.get(registry)?.get(id);
  if (!(origin && rule)) {
    throw new Error(`no admitted cast rule "${id}"`);
  }
  const fail = (path: string, message: string): never => {
    throw new CastRuleError({ source: origin.source, path: origin.path + path, message });
  };
  let context: Record<string, RuleScalar>;
  try {
    context = castRuleContext(event);
  } catch (error) {
    return fail('.trigger', errorMessage(error));
  }
  const evaluate = ({ program, path }: CompiledExpression): RuleScalar => {
    try {
      return program.evaluate(context);
    } catch (error) {
      return fail(path, errorMessage(error));
    }
  };
  if (rule.condition && !evaluate(rule.condition)) {
    return [];
  }
  let total = 0;
  return rule.effects.map((effect, index) => {
    const args = Object.fromEntries(
      Object.entries(VOLLEY_ARGUMENTS).map(([field, descriptor]) => {
        const value = evaluate(effect.arguments[field as VolleyArgument]);
        // Only the bounded count crosses int -> JS number; all other verb fields require explicit CEL doubles.
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < descriptor.min || numeric > descriptor.max) {
          fail(`.effects[${index}].${field}`, 'projectile argument outside engine bounds');
        }
        return [field, numeric];
      }),
    ) as Record<VolleyArgument, number>;
    total += args.count;
    if (
      total > CAST_RULE_LIMITS.projectiles ||
      !Number.isFinite(args.intervalSimSeconds * (args.count - 1)) ||
      !Number.isFinite(args.rangeMetres / args.speedMetresPerSimSecond)
    ) {
      fail(`.effects[${index}]`, 'volley exceeds engine work or duration bounds');
    }
    return {
      ...event,
      origin: { ...event.origin },
      aim: { ...event.aim },
      ...args,
      intervalSimSeconds: simSeconds(args.intervalSimSeconds),
      speedMetresPerSimSecond: simRate(args.speedMetresPerSimSecond),
      verb: 'projectileVolley',
      damageKind: effect.damageKind,
    };
  });
};
