import { type ASTNode, parse, serialize } from '@marcbachmann/cel-js';

export class AuthorError extends Error {}

const arithmetic = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'divide', '%': 'remainder', '-_': 'negate' };

export function mapChildren(node: ASTNode, visit: (child: ASTNode) => ASTNode): ASTNode {
  switch (node.op) {
    case 'value':
    case 'id':
      return node;
    case 'call':
      return { ...node, args: [node.args[0], node.args[1].map(visit)] };
    case 'rcall':
      return { ...node, args: [node.args[0], visit(node.args[1]), node.args[2].map(visit)] };
    case '.':
    case '.?':
      return { ...node, args: [visit(node.args[0]), node.args[1]] };
    case '!_':
    case '-_':
      return { ...node, args: visit(node.args) };
    case 'map':
      return { ...node, args: node.args.map(([key, value]): [ASTNode, ASTNode] => [visit(key), visit(value)]) };
    default:
      return { ...node, args: node.args.map(visit) } as ASTNode;
  }
}

export function rewriteArithmetic(
  node: ASTNode,
  callName: (name: string, node: ASTNode) => string = (name) => name,
): ASTNode {
  const rewritten = mapChildren(node, (child) => rewriteArithmetic(child, callName));
  if (Object.hasOwn(arithmetic, rewritten.op)) {
    return {
      ...rewritten,
      op: 'call',
      args: [
        callName(arithmetic[rewritten.op as keyof typeof arithmetic], node),
        rewritten.op === '-_' ? [rewritten.args] : rewritten.args,
      ] as [string, ASTNode[]],
    };
  }
  return rewritten;
}

// Locations and parser helpers are not semantic tree data.
export function treeShape(node: ASTNode): unknown {
  const children: unknown[] = [];
  mapChildren(node, (child) => {
    children.push(treeShape(child));
    return child;
  });
  switch (node.op) {
    case 'value':
    case 'id':
      return [node.op, typeof node.args, node.args];
    case 'call':
    case 'rcall':
      return [node.op, node.args[0], children];
    case '.':
    case '.?':
      return [node.op, node.args[1], children];
    default:
      return [node.op, children];
  }
}

function sameTree(a: ASTNode, b: ASTNode): boolean {
  const stringify = (node: ASTNode) =>
    JSON.stringify(treeShape(node), (_, value: unknown) => (typeof value === 'bigint' ? `${value}n` : value));
  return stringify(a) === stringify(b);
}

export function serializeRewrite(
  ast: ASTNode,
  callName?: (name: string, node: ASTNode) => string,
): {
  source: string;
  locate: (node?: { start?: number }) => ASTNode;
} {
  const rewritten = rewriteArithmetic(ast, callName);
  const source = serialize(rewritten);
  const reparsed = parse(source).ast;
  if (!sameTree(rewritten, reparsed)) {
    throw new Error(`serializer changed expression structure or literal value at offset ${ast.start}`);
  }
  const locations = new Map<number, ASTNode>();
  function pair(original: ASTNode, compiled: ASTNode): void {
    locations.set(compiled.start, original);
    const children: ASTNode[] = [];
    mapChildren(original, (child) => {
      children.push(child);
      return child;
    });
    let index = 0;
    mapChildren(compiled, (child) => {
      pair(children[index]!, child);
      index += 1;
      return child;
    });
  }
  pair(rewritten, reparsed);
  return { source, locate: (node) => locations.get(node?.start ?? -1) ?? ast };
}
