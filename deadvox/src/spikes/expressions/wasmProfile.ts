import { ExpressionIssue, type Schema } from './contract.ts';

const token =
  /\s*("(?:[^"\\\r\n]|\\["\\/bfnrt]|\\u[0-9a-fA-F]{4})*"|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|==|!=|~=|<=|>=|[<>()/])/y;
const atomStart = /^[A-Za-z_0-9"]/;
const identifier = /^[A-Za-z_][A-Za-z_0-9]*$/;
const words = {
  starlark: new Set(['True', 'False', 'and', 'or', 'not', 'if', 'else']),
  luau: new Set(['true', 'false', 'and', 'or', 'not', 'if', 'then', 'else']),
};
type Fail = (message: string) => never;

function scan(source: string, fail: Fail): string[] {
  if (source.length > 4096) {
    fail('source exceeds spike limit');
  }
  const tokens: string[] = [];
  let offset = 0;
  while (offset < source.length && source.slice(offset).trim() !== '') {
    token.lastIndex = offset;
    const match = token.exec(source);
    if (!match) {
      fail(`unsupported token at offset ${offset}`);
    }
    tokens.push(match![1]!);
    offset = token.lastIndex;
    if (tokens.length > 256) {
      fail('expression exceeds spike token limit');
    }
  }
  return tokens;
}

function checkParentheses(tokens: string[], keywords: Set<string>, fail: Fail): void {
  let depth = 0;
  let previous = '';
  for (const value of tokens) {
    if (value === '(') {
      const followsAtom = previous !== '' && !keywords.has(previous) && atomStart.test(previous);
      if (previous === ')' || followsAtom) {
        fail('calls are outside the scalar profile');
      }
      depth += 1;
      if (depth > 64) {
        fail('expression exceeds spike depth limit');
      }
    } else if (value === ')') {
      depth -= 1;
    }
    previous = value;
  }
}

// These bindings expose no AST or deterministic fuel API. A lexical scalar-only
// profile bounds work without pretending wall-clock cancellation is deterministic.
export function checkWasmProfile(source: string, schema: Schema, language: keyof typeof words): string[] {
  const fail: Fail = (message) => {
    throw new ExpressionIssue(`${language}: profile: ${message}`);
  };
  const keywords = words[language];
  const names = Object.keys(schema).sort();
  for (const name of names) {
    if (!identifier.test(name) || keywords.has(name)) {
      fail(`invalid schema field ${name}`);
    }
  }
  const tokens = scan(source, fail);
  for (const value of tokens) {
    if (identifier.test(value) && !keywords.has(value) && !Object.hasOwn(schema, value)) {
      fail(`undeclared field ${value}`);
    }
  }
  checkParentheses(tokens, keywords, fail);
  return names;
}
