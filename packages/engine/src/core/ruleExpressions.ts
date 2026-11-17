import { type ASTNode, Environment, serialize } from '@marcbachmann/cel-js';

export type RuleScalar = bigint | number | boolean | string;
export type RuleScalarType = 'int' | 'double' | 'bool' | 'string';

// These are safety ceilings, not gameplay tuning. No admitted node iterates over runtime data.
export const RULE_EXPRESSION_LIMITS = { sourceLength: 8192, nodes: 256, depth: 32 } as const;
const INT_MIN = -(1n << 63n);
const INT_MAX = (1n << 63n) - 1n;
const EXACT_INT_MAX = BigInt(Number.MAX_SAFE_INTEGER);

export const CAST_EXPRESSION_VARIABLES = {
  abilityLevel: 'int',
  casterId: 'string',
  abilityId: 'string',
  sourceItemUid: 'int',
  hand: 'string',
  originX: 'double',
  originY: 'double',
  originZ: 'double',
  aimX: 'double',
  aimY: 'double',
  aimZ: 'double',
} as const satisfies Record<string, RuleScalarType>;

const checked = (value: RuleScalar): RuleScalar => {
  if (typeof value === 'bigint' && (value < INT_MIN || value > INT_MAX)) {
    throw new Error('rule integer overflow');
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('rule non-finite arithmetic');
  }
  return value;
};

const arithmetic = (op: string, left: RuleScalar, right?: RuleScalar): RuleScalar => {
  if (typeof left === 'bigint' && (right === undefined || typeof right === 'bigint')) {
    switch (op) {
      case 'negate':
        return checked(-left);
      case 'add':
        return checked(left + right!);
      case 'subtract':
        return checked(left - right!);
      case 'multiply':
        return checked(left * right!);
      case 'divide':
        return checked(left / right!);
      case 'remainder':
        return checked(left % right!);
      default:
        throw new Error('unknown arithmetic operation');
    }
  }
  if (typeof left === 'number' && (right === undefined || typeof right === 'number')) {
    if ((op === 'divide' || op === 'remainder') && right === 0) {
      throw new Error('rule division by zero');
    }
    switch (op) {
      case 'negate':
        return checked(-left);
      case 'add':
        return checked(left + right!);
      case 'subtract':
        return checked(left - right!);
      case 'multiply':
        return checked(left * right!);
      case 'divide':
        return checked(left / right!);
      case 'remainder':
        return checked(left % right!);
      default:
        throw new Error('unknown arithmetic operation');
    }
  }
  throw new Error('rule arithmetic requires matching numeric types');
};

const numericFunctions = {
  min: (a: RuleScalar, b: RuleScalar): RuleScalar => (a < b ? a : b),
  max: (a: RuleScalar, b: RuleScalar): RuleScalar => (a > b ? a : b),
};
const conversions = {
  int: (value: RuleScalar): RuleScalar => {
    if (typeof value === 'bigint') {
      return checked(value);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('invalid int conversion');
    }
    return checked(BigInt(Math.trunc(value)));
  },
  double: (value: RuleScalar): RuleScalar => {
    if (typeof value === 'bigint' && (value < -EXACT_INT_MAX || value > EXACT_INT_MAX)) {
      throw new Error('int to double conversion would lose precision');
    }
    if (typeof value !== 'number' && typeof value !== 'bigint') {
      throw new Error('invalid double conversion');
    }
    return checked(Number(value));
  },
  floor: (value: RuleScalar): RuleScalar => checked(Math.floor(Number(value))),
  ceil: (value: RuleScalar): RuleScalar => checked(Math.ceil(Number(value))),
};
const operators = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
  '%': 'remainder',
  '==': 'equal',
  '!=': 'unequal',
  '<': 'less',
  '<=': 'lessEqual',
  '>': 'greater',
  '>=': 'greaterEqual',
} as const;
const comparisons = {
  equal: (a: RuleScalar, b: RuleScalar) => a === b,
  unequal: (a: RuleScalar, b: RuleScalar) => a !== b,
  less: (a: RuleScalar, b: RuleScalar) => a < b,
  lessEqual: (a: RuleScalar, b: RuleScalar) => a <= b,
  greater: (a: RuleScalar, b: RuleScalar) => a > b,
  greaterEqual: (a: RuleScalar, b: RuleScalar) => a >= b,
};

type Handler = (...args: RuleScalar[]) => RuleScalar;

const environment = (guard: (handler: Handler) => Handler): Environment => {
  const env = new Environment({
    unlistedVariablesAreDyn: false,
    limits: { maxAstNodes: RULE_EXPRESSION_LIMITS.nodes, maxDepth: RULE_EXPRESSION_LIMITS.depth, maxCallArguments: 3 },
  });
  for (const [name, type] of Object.entries(CAST_EXPRESSION_VARIABLES)) {
    env.registerVariable(name, type);
  }
  for (const type of ['int', 'double']) {
    for (const op of ['add', 'subtract', 'multiply', 'divide', 'remainder']) {
      env.registerFunction(
        `__${op}(${type}, ${type}): ${type}`,
        guard((a, b) => arithmetic(op, a!, b)),
      );
    }
    env.registerFunction(
      `__negate(${type}): ${type}`,
      guard((a) => arithmetic('negate', a!)),
    );
    for (const [name, handler] of Object.entries(numericFunctions)) {
      env.registerFunction(
        `${name}(${type}, ${type}): ${type}`,
        guard((a, b) => handler(a!, b!)),
      );
    }
    for (const name of ['int', 'double'] as const) {
      env.registerFunction(
        `__${name}(${type}): ${name}`,
        guard((a) => conversions[name](a!)),
      );
    }
  }
  for (const name of ['floor', 'ceil'] as const) {
    env.registerFunction(
      `${name}(double): double`,
      guard((a) => conversions[name](a!)),
    );
  }
  for (const type of ['int', 'double', 'bool', 'string']) {
    const entries = Object.entries(comparisons).filter(
      ([name]) => type !== 'bool' || name === 'equal' || name === 'unequal',
    );
    for (const [name, handler] of entries) {
      env.registerFunction(
        `__${name}(${type}, ${type}): bool`,
        guard((a, b) => handler(a!, b!)),
      );
    }
  }
  return env;
};

const call = (node: ASTNode, name: string, args: ASTNode[]): ASTNode => ({ ...node, op: 'call', args: [name, args] });

// The fingerprint ignores locations but preserves literal types, precision and grouping.
const fingerprint = (node: ASTNode): string =>
  JSON.stringify(node, (_key, value: unknown) => {
    if (value && typeof value === 'object' && 'op' in value && 'args' in value) {
      return { op: value.op, args: value.args };
    }
    if (typeof value === 'bigint') {
      return { int: String(value) };
    }
    if (typeof value === 'number' && Object.is(value, -0)) {
      return { double: '-0' };
    }
    return value;
  });

const scalarType = (value: unknown): RuleScalarType | undefined => {
  switch (typeof value) {
    case 'bigint':
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    case 'string':
      return 'string';
    default:
      return undefined;
  }
};

const admitLiteral = (value: unknown): void => {
  if (!scalarType(value)) {
    throw new Error('rule expressions admit only scalar literals');
  }
  checked(value as RuleScalar);
};

const functionName = (name: string): string => {
  if (!(Object.hasOwn(numericFunctions, name) || Object.hasOwn(conversions, name))) {
    throw new Error(`unsupported rule function ${name}`);
  }
  return name === 'int' || name === 'double' ? `__${name}` : name;
};

const ruleInputs = (
  context: Readonly<Record<string, RuleScalar>>,
  variables: ReadonlySet<string>,
): Record<string, RuleScalar> => {
  const inputs: Record<string, RuleScalar> = {};
  for (const [name, value] of Object.entries(context)) {
    const required = CAST_EXPRESSION_VARIABLES[name as keyof typeof CAST_EXPRESSION_VARIABLES];
    if (!Object.hasOwn(CAST_EXPRESSION_VARIABLES, name) || scalarType(value) !== required) {
      throw new Error(`invalid rule context ${name}`);
    }
    if (typeof value === 'string' && value.length > RULE_EXPRESSION_LIMITS.sourceLength) {
      throw new Error(`rule context string too long: ${name}`);
    }
    inputs[name] = checked(value);
  }
  for (const name of variables) {
    if (!Object.hasOwn(inputs, name)) {
      throw new Error(`missing rule context ${name}`);
    }
  }
  return inputs;
};

const rewrite = (root: ASTNode, variables: Set<string>): ASTNode => {
  let nodes = 0;
  const visit = (node: ASTNode, depth: number): ASTNode => {
    nodes += 1;
    if (nodes > RULE_EXPRESSION_LIMITS.nodes || depth > RULE_EXPRESSION_LIMITS.depth) {
      throw new Error('rule expression exceeds structural work reservation');
    }
    const child = (value: ASTNode) => visit(value, depth + 1);
    switch (node.op) {
      case 'value':
        admitLiteral(node.args);
        return node;
      case 'id':
        if (!Object.hasOwn(CAST_EXPRESSION_VARIABLES, node.args)) {
          throw new Error(`unknown rule variable ${node.args}`);
        }
        variables.add(node.args);
        return node;
      case 'call': {
        const [name, args] = node.args;
        return call(node, functionName(name), args.map(child));
      }
      case '!_':
        return { ...node, args: child(node.args) };
      case '-_':
        return call(node, '__negate', [child(node.args)]);
      case '?:':
        return { ...node, args: [child(node.args[0]), child(node.args[1]), child(node.args[2])] };
      case '&&':
      case '||':
        return { ...node, args: [child(node.args[0]), child(node.args[1])] };
      case '+':
      case '-':
      case '*':
      case '/':
      case '%':
      case '==':
      case '!=':
      case '<':
      case '<=':
      case '>':
      case '>=':
        return call(node, `__${operators[node.op]}`, node.args.map(child));
      default:
        throw new Error(`unsupported rule operation ${node.op}`);
    }
  };
  return visit(root, 1);
};

export interface CheckedRuleExpression {
  readonly work: number;
  evaluate: (context: Readonly<Record<string, RuleScalar>>) => RuleScalar;
}

export const compileRuleExpression = (source: string, expected: RuleScalarType): CheckedRuleExpression => {
  if (source.length > RULE_EXPRESSION_LIMITS.sourceLength) {
    throw new Error('rule expression source is too long');
  }
  let failure: unknown;
  const env = environment((handler) => (...args) => {
    try {
      return checked(handler(...args));
    } catch (error) {
      failure = error;
      throw error;
    }
  });
  const parsed = env.parse(source);
  const variables = new Set<string>();
  const transformed = rewrite(parsed.ast, variables);
  const checkedSource = parsed.check();
  if (!checkedSource.valid) {
    throw checkedSource.error;
  }
  const roundTrip = env.parse(serialize(parsed.ast));
  if (fingerprint(parsed.ast) !== fingerprint(roundTrip.ast)) {
    throw new Error('rule serializer changes expression semantics');
  }
  const program = env.parse(serialize(transformed));
  if (fingerprint(transformed) !== fingerprint(program.ast)) {
    throw new Error('rule serializer changes checked expression semantics');
  }
  const type = program.check();
  if (!type.valid) {
    throw type.error;
  }
  if (type.type !== expected) {
    throw new Error(`rule expression requires ${expected}, got ${type.type}`);
  }
  return {
    // Each admitted scalar node/callback has constant bounded work. Source length also bounds strings.
    work: source.length + RULE_EXPRESSION_LIMITS.nodes,
    evaluate(context) {
      failure = undefined;
      const inputs = ruleInputs(context, variables);
      const value: unknown = program(inputs);
      if (failure !== undefined) {
        throw failure;
      }
      if (scalarType(value) !== expected) {
        throw new Error(`invalid rule result: expected ${expected}`);
      }
      return checked(value as RuleScalar);
    },
  };
};
