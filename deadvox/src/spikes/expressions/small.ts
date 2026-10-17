import type { Candidate, Inputs, Scalar, Schema, ValueType } from './contract.ts';
import { checkedInputs, checkedResult, ExpressionIssue } from './contract.ts';

type Node =
  | { tag: 'literal'; value: Scalar }
  | { tag: 'name'; name: string }
  | { tag: 'not'; child: Node }
  | { tag: 'binary'; op: string; left: Node; right: Node }
  | { tag: 'if'; condition: Node; yes: Node; no: Node };
const precedence: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
};
const issue = (message: string): never => {
  throw new ExpressionIssue(`small: expression: ${message}`);
};

const TOKEN =
  /^\s*("(?:[^"\\\r\n]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|&&|\|\||==|!=|<=|>=|[!<>()?:])/;
const WHITESPACE = /^\s*$/;
const NUMBER = /^\d/;
const NAME = /^[A-Za-z_]/;

function parse(source: string): Node {
  if (source.length > 4096) {
    issue('source exceeds spike limit');
  }
  const tokens: string[] = [];
  let offset = 0;
  while (offset < source.length) {
    const match = TOKEN.exec(source.slice(offset));
    if (!match) {
      if (WHITESPACE.test(source.slice(offset))) {
        break;
      }
      return issue(`unexpected token at offset ${offset}`);
    }
    tokens.push(match[1]!);
    offset += match[0].length;
  }
  let index = 0;
  let nodes = 0;
  function take(): string | undefined {
    const token = tokens[index];
    index += 1;
    return token;
  }
  function expect(token: string): void {
    if (take() !== token) {
      issue(`expected ${token} at token ${index}`);
    }
  }
  function primary(depth: number): Node {
    const token = take();
    if (token === '!') {
      return { tag: 'not', child: expression(5, depth + 1) };
    }
    if (token === '(') {
      const child = expression(0, depth + 1);
      expect(')');
      return child;
    }
    return atom(token) ?? issue(`expected expression at token ${index}`);
  }
  function expression(min = 0, depth = 0): Node {
    nodes += 1;
    if (depth > 64 || nodes > 256) {
      issue('expression exceeds spike complexity limit');
    }
    let left = primary(depth);
    while (true) {
      const op = tokens[index];
      const rank = op === undefined ? undefined : precedence[op];
      if (rank === undefined || rank < min) {
        break;
      }
      index += 1;
      left = { tag: 'binary', op: op!, left, right: expression(rank + 1, depth + 1) };
    }
    if (min === 0 && tokens[index] === '?') {
      index += 1;
      const yes = expression(0, depth + 1);
      expect(':');
      left = { tag: 'if', condition: left, yes, no: expression(0, depth + 1) };
    }
    return left;
  }
  const ast = expression();
  if (index !== tokens.length) {
    issue(`unexpected ${tokens[index]} at token ${index + 1}`);
  }
  return ast;
}

function atom(token: string | undefined): Node | undefined {
  if (token === undefined) {
    return undefined;
  }
  if (token === 'true' || token === 'false') {
    return { tag: 'literal', value: token === 'true' };
  }
  if (token.startsWith('"')) {
    return { tag: 'literal', value: JSON.parse(token) as string };
  }
  if (NUMBER.test(token)) {
    const value = Number(token);
    if (!Number.isFinite(value)) {
      issue('number must be finite');
    }
    return { tag: 'literal', value };
  }
  if (NAME.test(token)) {
    return { tag: 'name', name: token };
  }
  return undefined;
}
function operandType(op: string, left: ValueType): ValueType {
  if (op === '&&' || op === '||') {
    return 'boolean';
  }
  if (op === '==' || op === '!=') {
    return left;
  }
  return 'number';
}
function typeOf(node: Node, schema: Schema): ValueType {
  switch (node.tag) {
    case 'literal':
      return typeof node.value as ValueType;
    case 'name': {
      const type = Object.hasOwn(schema, node.name) ? schema[node.name] : undefined;
      return type ?? issue(`undeclared field ${node.name}`);
    }
    case 'not':
      if (typeOf(node.child, schema) !== 'boolean') {
        issue('! expects boolean');
      }
      return 'boolean';
    case 'binary': {
      const left = typeOf(node.left, schema);
      const right = typeOf(node.right, schema);
      const expected = operandType(node.op, left);
      if (left !== expected || right !== expected) {
        issue(`${node.op} expects matching ${expected} operands`);
      }
      return 'boolean';
    }
    case 'if': {
      if (typeOf(node.condition, schema) !== 'boolean') {
        issue('condition expects boolean');
      }
      const yes = typeOf(node.yes, schema);
      if (yes !== typeOf(node.no, schema)) {
        issue('branches must have matching types');
      }
      return yes;
    }
    default:
      return unreachable(node);
  }
}
function evaluate(node: Node, inputs: Inputs): Scalar {
  switch (node.tag) {
    case 'literal':
      return node.value;
    case 'name':
      return inputs[node.name]!;
    case 'not':
      return !evaluate(node.child, inputs);
    case 'if':
      return evaluate(evaluate(node.condition, inputs) ? node.yes : node.no, inputs);
    case 'binary': {
      const left = evaluate(node.left, inputs);
      if (node.op === '&&') {
        return Boolean(left && evaluate(node.right, inputs));
      }
      if (node.op === '||') {
        return Boolean(left || evaluate(node.right, inputs));
      }
      const right = evaluate(node.right, inputs);
      switch (node.op) {
        case '==':
          return left === right;
        case '!=':
          return left !== right;
        case '<':
          return left < right;
        case '<=':
          return left <= right;
        case '>':
          return left > right;
        case '>=':
          return left >= right;
        default:
          return issue(`unknown operator ${node.op}`);
      }
    }
    default:
      return unreachable(node);
  }
}
function print(node: Node): string {
  switch (node.tag) {
    case 'literal':
      return JSON.stringify(node.value);
    case 'name':
      return node.name;
    case 'not':
      return `(!${print(node.child)})`;
    case 'binary':
      return `(${print(node.left)} ${node.op} ${print(node.right)})`;
    case 'if':
      return `(${print(node.condition)} ? ${print(node.yes)} : ${print(node.no)})`;
    default:
      return unreachable(node);
  }
}
function unreachable(node: never): never {
  return issue(`invalid AST: ${String(node)}`);
}
export const small = {
  name: 'small-profile-1',
  load(source, schema, result) {
    try {
      const inputsSchema = Object.freeze({ ...schema });
      const ast = parse(source);
      if (typeOf(ast, inputsSchema) !== result) {
        issue(`result must be ${result}`);
      }
      return {
        canonical: print(ast),
        evaluate: (inputs) => checkedResult(evaluate(ast, checkedInputs(inputs, inputsSchema)), result),
      };
    } catch (error) {
      if (error instanceof ExpressionIssue) {
        throw error;
      }
      throw new ExpressionIssue(`small: expression: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  },
} satisfies Candidate;
