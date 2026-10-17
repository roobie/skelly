import { type ASTNode, Environment, serialize } from '@marcbachmann/cel-js';
import type { ContentIssue } from '../../core/content.ts';
import { ModLoadError } from './modLoadError.ts';

const identifierPattern = /^[a-z][a-z0-9_]*$/;
const modIdentifierPattern = /^[a-z][a-z0-9]*$/;
function compareId(a: { id: string }, b: { id: string }): number {
  if (a.id === b.id) {
    return 0;
  }
  return a.id < b.id ? -1 : 1;
}

export const modProfile = 'cel-js-8.0.0-mod-spike-2';
export const modLimits = Object.freeze({
  source: 4096,
  nodes: 256,
  depth: 32,
  collection: 16,
  text: 128,
  magnitude: 1e6,
  chain: 8,
});
const limits = modLimits;
export interface FunctionDef {
  name: string;
  params: string[];
  expression: string;
  replaces?: string;
}
export interface StateDef {
  key: string;
  min: number;
  max: number;
  initial: number;
  bands: number[];
}
interface RuleDef {
  id: string;
  event?: string;
  when: string;
  effects: string;
  onTrue?: string;
  onFalse?: string;
}
export interface ModDef {
  id: string;
  dependencies: string[];
  optional?: string[];
  requires?: string;
  functions: FunctionDef[];
  state: StateDef[];
  rules: RuleDef[];
}
export interface Snapshot {
  intellect: number;
  level: number;
  flags: string[];
  target: Record<string, number>;
}
export interface Effect {
  kind: string;
  key: string;
  amount: number;
}
interface Program {
  canonical: string;
  cost: number;
  run: (input: Record<string, unknown>) => unknown;
}
interface LoadedRule {
  mod: string;
  def: RuleDef;
  when: Program;
  effects: Program;
  stateKeys: ReadonlySet<string>;
}
interface LoadedFunction {
  owner: string;
  def: FunctionDef;
  program: Program;
}
export interface TickResult {
  effects: Effect[];
  fired: string[];
  issues: ContentIssue[];
  spent: number;
}

function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limits.magnitude) {
    throw new Error('expected bounded finite double');
  }
  return value;
}
const maths: Record<string, { arity: number; run: (...args: number[]) => number }> = {
  add: { arity: 2, run: (a, b) => a! + b! },
  sub: { arity: 2, run: (a, b) => a! - b! },
  mul: { arity: 2, run: (a, b) => a! * b! },
  divide: {
    arity: 2,
    run: (a, b) => {
      if (b === 0) {
        throw new Error('division by zero');
      }
      return a! / b!;
    },
  },
  pow: { arity: 2, run: (a, b) => a! ** b! },
  exp: { arity: 1, run: (a) => Math.exp(a!) },
  min: { arity: 2, run: (a, b) => Math.min(a!, b!) },
  max: { arity: 2, run: (a, b) => Math.max(a!, b!) },
  clamp: { arity: 3, run: (x, lo, hi) => Math.max(lo!, Math.min(hi!, x!)) },
};
const verbs: Record<string, { arity: number; kind: string }> = {
  spend: { arity: 1, kind: 'spend' },
  damage: { arity: 1, kind: 'damage' },
  overload: { arity: 1, kind: 'overload' },
  change: { arity: 2, kind: 'change' },
};
export const modVariables: Readonly<Record<string, string>> = {
  intellect: 'double',
  level: 'double',
  roll: 'double',
  flags: 'list<string>',
  target: 'map<string, double>',
  state: 'map<string, double>',
};

function location(mod: string, path: string, error: unknown): ContentIssue {
  return { source: mod, path, message: error instanceof Error ? error.message : String(error) };
}
function fail(mod: string, path: string, error: unknown): never {
  throw new ModLoadError(location(mod, path, error));
}
function literal(node: ASTNode | undefined): string {
  if (node?.op !== 'value' || typeof node.args !== 'string') {
    throw new Error('reference must be a literal string');
  }
  return node.args;
}
function name(value: string): void {
  if (!identifierPattern.test(value)) {
    throw new Error(`invalid identifier ${value}`);
  }
}

function boundedEnvironment(source: string): Environment {
  if (source.length > limits.source) {
    throw new Error('source limit');
  }
  return new Environment({
    unlistedVariablesAreDyn: false,
    limits: {
      maxAstNodes: limits.nodes,
      maxDepth: limits.depth,
      maxListElements: limits.collection,
      maxMapEntries: limits.collection,
      maxCallArguments: limits.collection,
    },
  });
}

// No general host callbacks or dynamic dispatch: the static cost includes every reachable function body.
export function compileModExpression(
  source: string,
  {
    schema,
    result,
    functions,
    states,
    label = 'expression',
  }: {
    label?: string;
    schema: Readonly<Record<string, string>>;
    result: string;
    functions: Map<string, LoadedFunction>;
    states: Set<string>;
  },
): Program {
  const env = boundedEnvironment(source);
  let activeFrame: { failure?: { error: unknown } } | undefined;
  function register<Args extends unknown[], Result>(signature: string, handler: (...args: Args) => Result): void {
    env.registerFunction(signature, (...args: Args) => {
      try {
        return handler(...args);
      } catch (error) {
        // CEL may discard a callback exception after evaluating a decisive boolean.
        if (activeFrame) {
          activeFrame.failure ??= { error };
        }
        throw error;
      }
    });
  }
  env.registerType('Effect', { fields: { kind: 'string', key: 'string', amount: 'double' } });
  for (const [key, type] of Object.entries(schema)) {
    env.registerVariable(key, type);
  }
  for (const [key, math] of Object.entries(maths)) {
    register(`${key}(${new Array(math.arity).fill('double').join(',')}): double`, (...args: number[]) =>
      finite(math.run(...args.map(finite))),
    );
  }
  for (const [key, verb] of Object.entries(verbs)) {
    register(`${key}(${verb.arity === 2 ? 'string,double' : 'double'}): Effect`, (...args: (string | number)[]) => {
      const amount = finite(args.at(-1));
      if (verb.kind !== 'change' && amount < 0) {
        throw new Error('negative engine effect');
      }
      return { kind: verb.kind, key: verb.arity === 2 ? args[0] : 'bound-target', amount };
    });
  }
  register('rank(double, list<double>): double', (value: number, bands: number[]) => {
    finite(value);
    if (bands.length > limits.collection) {
      throw new Error('bands limit');
    }
    return bands.filter((threshold) => value >= finite(threshold)).length;
  });
  register(
    'weighted(double, list<double>, list<Effect>): list<Effect>',
    (roll: number, weights: number[], effects: Effect[]) => {
      finite(roll);
      if (roll < 0 || roll >= 1 || weights.length !== effects.length || weights.length > limits.collection) {
        throw new Error('invalid weighted choices');
      }
      const total = weights.reduce((sum, weight) => {
        if (finite(weight) < 0) {
          throw new Error('negative weight');
        }
        return finite(sum + weight);
      }, 0);
      if (total === 0) {
        return [];
      }
      let cursor = roll * total;
      for (let i = 0; i < weights.length; i++) {
        cursor -= weights[i]!;
        if (cursor < 0) {
          return [effects[i]!];
        }
      }
      throw new Error('weighted choice outside range');
    },
  );
  for (const [key, fn] of functions) {
    register(`${key}(${fn.def.params.map(() => 'double').join(',')}): double`, (...args: number[]) =>
      finite(fn.program.run(Object.fromEntries(fn.def.params.map((param, i) => [param, finite(args[i])])))),
    );
  }
  const parsed = env.parse(source);
  function at(node: ASTNode, message: string): never {
    throw new Error(`${message} at offset ${node.start}`);
  }
  function literalCost(node: Extract<ASTNode, { op: 'value' }>): number {
    if (typeof node.args === 'number') {
      finite(node.args);
    } else if (typeof node.args !== 'boolean' && typeof node.args !== 'string') {
      at(node, 'only double, bool and string literals');
    }
    if (typeof node.args === 'string' && node.args.length > limits.text) {
      at(node, 'string limit');
    }
    return 1;
  }
  function indexCost(node: Extract<ASTNode, { op: '[]' }>): number {
    const [receiver, index] = node.args;
    if (receiver.op !== 'id' || !['state', 'target'].includes(receiver.args)) {
      at(node, 'only declared maps may be indexed');
    }
    const key = literal(index);
    if (receiver.op === 'id' && receiver.args === 'state' && !states.has(key)) {
      at(node, `unknown state ${key}`);
    }
    return 3;
  }
  function callCost(node: Extract<ASTNode, { op: 'call' }>, macro: boolean): number {
    const [key, args] = node.args;
    const known =
      Object.hasOwn(maths, key) ||
      Object.hasOwn(verbs, key) ||
      ['weighted', 'rank'].includes(key) ||
      functions.has(key);
    if (!known) {
      at(node, `unknown function or effect ${key}`);
    }
    if (key === 'change' && !states.has(literal(args[0]))) {
      at(node, `unknown state ${literal(args[0])}`);
    }
    const intrinsic = ['weighted', 'rank'].includes(key) ? limits.collection * 4 : 1;
    return (
      1 + (functions.get(key)?.program.cost ?? intrinsic) + args.reduce((sum, child) => sum + cost(child, macro), 0)
    );
  }
  function macroCost(node: Extract<ASTNode, { op: 'rcall' }>, macro: boolean): number {
    const [key, receiver, args] = node.args;
    if (macro || !['exists', 'all'].includes(key) || args.length !== 2 || args[0]?.op !== 'id') {
      at(node, 'only non-nested all/exists macros');
    }
    if (!(receiver.op === 'list' || (receiver.op === 'id' && receiver.args === 'flags'))) {
      at(node, 'macro receiver must be a bounded list');
    }
    return 1 + cost(receiver, true) + limits.collection * cost(args[1]!, true);
  }
  function cost(node: ASTNode, macro = false): number {
    switch (node.op) {
      case 'value':
        return literalCost(node);
      case 'id':
        return 1;
      case '!_':
        return 1 + cost(node.args, macro);
      case '&&':
      case '||':
      case '==':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=':
      case '?:':
      case 'in':
        return limits.nodes * limits.collection + node.args.reduce((sum, child) => sum + cost(child, macro), 0);
      case '[]':
        return indexCost(node);
      case 'list':
        return 1 + node.args.reduce((sum, child) => sum + cost(child, macro), 0);
      case 'map':
        return 1 + node.args.flat().reduce((sum, child) => sum + cost(child, macro), 0);
      case 'call':
        return callCost(node, macro);
      case 'rcall':
        return macroCost(node, macro);
      default:
        return at(node, `operator ${node.op} excluded; use checked math functions for arithmetic`);
    }
  }
  const total = cost(parsed.ast);
  if (!Number.isSafeInteger(total) || total > limits.magnitude) {
    throw new Error('expanded evaluation cost limit');
  }
  const checked = parsed.check();
  if (!checked.valid) {
    throw checked.error;
  }
  if (checked.type !== result) {
    throw new Error(`expected ${result}, got ${checked.type}`);
  }
  return {
    canonical: serialize(parsed.ast),
    cost: total,
    run: (input) => {
      const previous = activeFrame;
      const frame: { failure?: { error: unknown } } = {};
      activeFrame = frame;
      try {
        const value = parsed(input) as unknown;
        if (frame.failure) {
          throw frame.failure.error;
        }
        return value;
      } catch (error) {
        const { node } = error as { node?: { start?: number } };
        throw new Error(
          `${label}: ${error instanceof Error ? error.message : String(error)} at offset ${node?.start ?? parsed.ast.start}`,
          { cause: error },
        );
      } finally {
        activeFrame = previous;
      }
    },
  };
}

function ownRecord(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new Error('expected plain record');
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!('value' in descriptor)) {
      throw new Error('accessors are not inputs');
    }
    result[key] = descriptor.value;
  }
  return result;
}
function snapshot(value: Snapshot): Snapshot {
  const data = ownRecord(value);
  const { flags } = data;
  if (!Array.isArray(flags) || flags.length > limits.collection) {
    throw new Error('flags limit');
  }
  const copied: string[] = [];
  for (let i = 0; i < flags.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(flags, i);
    if (
      !(descriptor && 'value' in descriptor) ||
      typeof descriptor.value !== 'string' ||
      descriptor.value.length > limits.text
    ) {
      throw new Error('invalid flag');
    }
    copied.push(descriptor.value);
  }
  const target = ownRecord(data.target);
  if (Object.keys(target).length > limits.collection) {
    throw new Error('target limit');
  }
  for (const [key, val] of Object.entries(target)) {
    if (key.length > limits.text) {
      throw new Error('target key limit');
    }
    target[key] = finite(val);
  }
  return {
    intellect: finite(data.intellect),
    level: finite(data.level),
    flags: copied,
    target: target as Record<string, number>,
  };
}

export class ModHarness {
  readonly identity: string;
  readonly rules = new Map<string, LoadedRule>();
  readonly functions = new Map<string, LoadedFunction>();
  readonly declarations = new Map<string, StateDef>();
  private values: Record<string, number> = Object.create(null);
  private rng: number;
  private totals: Record<string, number> = Object.create(null);
  applied(): Readonly<Record<string, number>> {
    return { ...this.totals };
  }
  constructor(input: ModDef[], seed = 1) {
    if (!Number.isInteger(seed) || seed < 1 || seed > 0xff_ff_ff_ff) {
      throw new Error('invalid seed');
    }
    this.rng = seed;
    const sorted = this.orderPacks(structuredClone(input));
    const visible = this.loadStates(sorted);
    if (this.declarations.size > limits.collection) {
      fail('mods', 'state', 'state collection limit');
    }
    this.loadFunctions(sorted, visible);
    this.loadRules(sorted, visible);
    this.checkRuleReferences(visible);
    this.identity = JSON.stringify({ profile: modProfile, limits, packs: sorted });
  }
  private orderPacks(packs: ModDef[]): ModDef[] {
    const ids = new Set(packs.map((pack) => pack.id));
    if (ids.size !== packs.length) {
      fail('mods', '', 'duplicate mod');
    }
    for (const pack of packs) {
      if (pack.requires && !pack.optional?.includes(pack.requires)) {
        fail(pack.id, 'requires', 'gate must name an optional dependency');
      }
    }
    let active = packs;
    for (;;) {
      const next = active.filter(
        (pack) => !pack.requires || active.some((candidate) => candidate.id === pack.requires),
      );
      if (next.length === active.length) {
        break;
      }
      active = next;
    }
    const sorted: ModDef[] = [];
    const visiting = new Set<string>();
    const visit = (pack: ModDef): void => {
      if (sorted.includes(pack)) {
        return;
      }
      if (visiting.has(pack.id)) {
        fail(pack.id, 'dependencies', 'dependency cycle');
      }
      visiting.add(pack.id);
      for (const dep of [
        ...pack.dependencies,
        ...(pack.optional ?? []).filter((id) => active.some((p) => p.id === id)),
      ].sort()) {
        const found = active.find((p) => p.id === dep);
        if (!found) {
          fail(pack.id, 'dependencies', `unknown dependency ${dep}`);
        }
        visit(found);
      }
      visiting.delete(pack.id);
      sorted.push(pack);
    };
    for (const pack of active.sort(compareId)) {
      visit(pack);
    }
    return sorted;
  }
  private loadStates(sorted: ModDef[]): Map<string, Set<string>> {
    const visible = new Map<string, Set<string>>();
    for (const pack of sorted) {
      try {
        if (!modIdentifierPattern.test(pack.id)) {
          throw new Error('invalid mod identifier');
        }
        const scope = new Set([pack.id]);
        for (const dep of [...pack.dependencies, ...(pack.optional ?? [])]) {
          for (const id of visible.get(dep) ?? []) {
            scope.add(id);
          }
        }
        visible.set(pack.id, scope);
        for (const state of pack.state) {
          this.addState(pack.id, state);
        }
      } catch (error) {
        fail(pack.id, 'state', error);
      }
    }
    return visible;
  }
  private addState(mod: string, state: StateDef): void {
    if (!state.key.startsWith(`${mod}:`) || state.key.length > limits.text || this.declarations.has(state.key)) {
      throw new Error(`invalid state ${state.key}`);
    }
    for (const val of [state.min, state.max, state.initial, ...state.bands]) {
      finite(val);
    }
    if (
      state.min > state.initial ||
      state.initial > state.max ||
      state.bands.length > limits.collection ||
      state.bands.some((v, i) => v <= state.min || v > state.max || (i > 0 && v <= state.bands[i - 1]!))
    ) {
      throw new Error('invalid state bounds/bands');
    }
    this.declarations.set(state.key, state);
    this.values[state.key] = state.initial;
  }
  private loadFunctions(sorted: ModDef[], visible: Map<string, Set<string>>): void {
    const definitions = new Map<string, { owner: string; def: FunctionDef }>();
    for (const pack of sorted) {
      for (const def of pack.functions) {
        try {
          this.addFunctionDefinition(pack.id, def, definitions, visible.get(pack.id)!);
        } catch (error) {
          fail(pack.id, `functions.${def.name}`, error);
        }
      }
    }
    const pending = new Set(definitions.keys());
    const stack = new Set<string>();
    const loadFunction = (key: string): void => {
      if (!pending.has(key)) {
        return;
      }
      const entry = definitions.get(key)!;
      const path = `functions.${entry.def.name}`;
      if (stack.has(key)) {
        fail(entry.owner, path, 'recursive function');
      }
      stack.add(key);
      try {
        // Parse solely to discover declared calls; the profile and CEL checker remain authoritative.
        const { ast } = boundedEnvironment(entry.def.expression).parse(entry.def.expression);
        const discover = (node: ASTNode): void => {
          switch (node.op) {
            case 'value':
            case 'id':
              return;
            case 'call':
              if (definitions.has(node.args[0])) {
                loadFunction(node.args[0]);
              }
              node.args[1].forEach(discover);
              return;
            case 'rcall':
              discover(node.args[1]);
              node.args[2].forEach(discover);
              return;
            case '!_':
            case '-_':
              discover(node.args);
              return;
            case '.':
            case '.?':
              discover(node.args[0]);
              return;
            case 'map':
              node.args.flat().forEach(discover);
              return;
            default:
              node.args.forEach(discover);
          }
        };
        discover(ast);
        const scope = new Map([...this.functions].filter(([, fn]) => visible.get(entry.owner)!.has(fn.owner)));
        // A dependent replacement is visible under the original function's public name.
        for (const [id, fn] of this.functions) {
          if (definitions.get(id)?.def.replaces && visible.get(entry.owner)!.has(id.split('_')[0]!)) {
            scope.set(id, fn);
          }
        }
        const program = compileModExpression(entry.def.expression, {
          label: `${entry.owner}:functions.${entry.def.name}`,
          schema: Object.fromEntries(entry.def.params.map((p) => [p, 'double'])),
          result: 'double',
          functions: scope,
          states: new Set(),
        });
        this.functions.set(key, { ...entry, program });
        pending.delete(key);
      } catch (error) {
        if (error instanceof ModLoadError) {
          throw error;
        }
        fail(entry.owner, path, error);
      }
      stack.delete(key);
    };
    for (const key of definitions.keys()) {
      loadFunction(key);
    }
  }
  private addFunctionDefinition(
    mod: string,
    def: FunctionDef,
    definitions: Map<string, { owner: string; def: FunctionDef }>,
    visible: Set<string>,
  ): void {
    name(def.name);
    if (def.params.length > limits.collection) {
      throw new Error('function parameter limit');
    }
    for (const param of def.params) {
      name(param);
    }
    const key = def.replaces ?? `${mod}_${def.name}`;
    if (def.replaces) {
      const original = definitions.get(key);
      if (
        !(original && visible.has(original.owner)) ||
        original.owner === mod ||
        original.def.params.length !== def.params.length
      ) {
        throw new Error(`invalid replacement ${key}`);
      }
    } else if (definitions.has(key) || Object.hasOwn(maths, key) || Object.hasOwn(verbs, key)) {
      throw new Error(`duplicate function ${key}`);
    }
    definitions.set(key, { owner: mod, def });
  }
  private loadRules(sorted: ModDef[], visible: Map<string, Set<string>>): void {
    const stateScope = (mod: string) =>
      new Set([...this.declarations.keys()].filter((key) => visible.get(mod)!.has(key.split(':')[0]!)));
    for (const pack of sorted) {
      for (const def of [...pack.rules].sort(compareId)) {
        try {
          if (!def.id.startsWith(`${pack.id}:`) || this.rules.has(def.id)) {
            throw new Error(`invalid rule ${def.id}`);
          }
          if (def.event && !['cast', 'decay'].includes(def.event)) {
            throw new Error(`unknown event ${def.event}`);
          }
          const scope = new Map(
            [...this.functions].filter(
              ([id, fn]) => visible.get(pack.id)!.has(fn.owner) || visible.get(pack.id)!.has(id.split('_')[0]!),
            ),
          );
          const states = stateScope(pack.id);
          this.rules.set(def.id, {
            mod: pack.id,
            def,
            stateKeys: states,
            when: compileModExpression(def.when, { schema: modVariables, result: 'bool', functions: scope, states }),
            effects: compileModExpression(def.effects, {
              schema: modVariables,
              result: 'list<Effect>',
              functions: scope,
              states,
            }),
          });
        } catch (error) {
          fail(pack.id, `rules.${def.id}`, error);
        }
      }
    }
  }
  private checkRuleReferences(visible: Map<string, Set<string>>): void {
    for (const rule of this.rules.values()) {
      for (const ref of [rule.def.onTrue, rule.def.onFalse]) {
        const target = ref ? this.rules.get(ref) : undefined;
        if (ref && !(target && visible.get(rule.mod)!.has(target.mod))) {
          fail(rule.mod, `rules.${rule.def.id}`, `unknown rule ${ref}`);
        }
      }
    }
  }
  state(key: string): number {
    if (!Object.hasOwn(this.values, key)) {
      throw new Error(`unknown state ${key}`);
    }
    return this.values[key]!;
  }
  rank(key: string): number {
    return this.declarations.get(key)!.bands.filter((band) => this.state(key) >= band).length;
  }
  private random(): number {
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 0x1_00_00_00_00;
  }
  private apply(effects: Effect[], result: TickResult): void {
    if (!Array.isArray(effects) || effects.length > limits.collection) {
      throw new Error('effect list limit');
    }
    for (const effect of effects) {
      finite(effect.amount);
      if (effect.kind === 'change') {
        const def = this.declarations.get(effect.key)!;
        const next = this.state(effect.key) + effect.amount;
        if (!Number.isFinite(next) || next < def.min || next > def.max) {
          throw new Error(`state write outside bounds: ${effect.key}`);
        }
        this.values[effect.key] = next;
      } else {
        this.totals[effect.kind] = finite((this.totals[effect.kind] ?? 0) + effect.amount);
      }
      result.effects.push(effect);
    }
  }
  tick(event: string, input: Snapshot, budget: number): TickResult {
    const result: TickResult = { effects: [], fired: [], issues: [], spent: 0 };
    const before = { ...this.values };
    const { rng } = this;
    const totals = { ...this.totals };
    let current: LoadedRule | undefined;
    let path = 'tick';
    try {
      if (!['cast', 'decay'].includes(event)) {
        throw new Error(`unknown event ${event}`);
      }
      if (!Number.isSafeInteger(budget) || budget < 0) {
        throw new Error('invalid tick budget');
      }
      const safe = snapshot(input);
      const fire = (rule: LoadedRule, depth: number): void => {
        current = rule;
        path = `rules.${rule.def.id}`;
        if (depth > limits.chain) {
          throw new Error('rule chain depth limit');
        }
        const cost = rule.when.cost + rule.effects.cost;
        if (result.spent + cost > budget) {
          throw new Error('tick cost limit');
        }
        result.spent += cost;
        const context = {
          ...safe,
          state: new Map(Object.entries(this.values).filter(([key]) => rule.stateKeys.has(key))),
          target: new Map(Object.entries(safe.target)),
          roll: this.random(),
        };
        path = `rules.${rule.def.id}.when`;
        const matches = rule.when.run(context) as boolean;
        if (matches) {
          path = `rules.${rule.def.id}.effects`;
          this.apply(rule.effects.run(context) as Effect[], result);
          result.fired.push(rule.def.id);
        }
        const next = matches ? rule.def.onTrue : rule.def.onFalse;
        if (next) {
          fire(this.rules.get(next)!, depth + 1);
        }
      };
      for (const rule of this.rules.values()) {
        if (rule.def.event === event) {
          fire(rule, 0);
        }
      }
    } catch (error) {
      this.values = before;
      this.rng = rng;
      this.totals = totals;
      result.effects = [];
      result.fired = [];
      result.issues.push(location(current?.mod ?? 'engine', path, error));
    }
    return result;
  }
  save(): string {
    return JSON.stringify({ identity: this.identity, values: this.values, rng: this.rng, totals: this.totals });
  }
  restore(text: string): void {
    const save = ownRecord(JSON.parse(text) as unknown);
    if (save.identity !== this.identity) {
      throw new Error('mod identity mismatch');
    }
    const values = ownRecord(save.values);
    if (Object.keys(values).length !== this.declarations.size) {
      throw new Error('state keys mismatch');
    }
    for (const [key, def] of this.declarations) {
      const value = finite(values[key]);
      if (value < def.min || value > def.max) {
        throw new Error(`invalid saved state ${key}`);
      }
    }
    if (!Number.isInteger(save.rng) || (save.rng as number) < 1 || (save.rng as number) > 0xff_ff_ff_ff) {
      throw new Error('invalid saved random state');
    }
    const totals = ownRecord(save.totals);
    for (const [key, value] of Object.entries(totals)) {
      if (!Object.hasOwn(verbs, key) || key === 'change' || finite(value) < 0) {
        throw new Error('invalid saved effect totals');
      }
    }
    this.values = values as Record<string, number>;
    this.rng = save.rng as number;
    this.totals = totals as Record<string, number>;
  }
}
