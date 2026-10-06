import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from './lit-check/node_modules/typescript/lib/typescript.js';

const DEADVOX = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SOURCE = join(DEADVOX, 'src');
const CONTENT = join(SOURCE, 'content', 'base');
const ALLOW_REAL = new Set([join(SOURCE, 'game', 'frameDriver.ts')]);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const REAL_NAMES = new Set(['Date', 'performance', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'timeStamp']);
const TEMPORAL_NAME = /(?:Time|Duration|Interval|Cooldown|Windup|BurnTime|BurnRemaining|RotsAfter|Per(?:Sim|Game|Real)(?:Second|Minute|Hour)|Timestamp)/i;
const CLOCK_UNIT = /(?:Sim|Game|Real)(?:Milliseconds?|Seconds?(?:Squared)?|Minutes?|Hours?|TimeOfDay|Timestamp|Rate)/;

const walkFiles = (dir, accept) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walkFiles(path, accept) : accept(path) ? [path] : [];
});
const sourceAst = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.json') ? ts.ScriptKind.JSON : ts.ScriptKind.TS);
const propertyName = (node) => ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

const realClockFindings = (file, text) => {
  if (ALLOW_REAL.has(file)) return [];
  const source = sourceAst(file, text);
  const findings = [];
  const report = (node, name) => findings.push(`${file}:${lineOf(source, node)}: Real clock/API ${name} is not allowed in the simulation dependency graph`);
  const visit = (node) => {
    if (ts.isIdentifier(node) && REAL_NAMES.has(node.text)) {
      if (node.text === 'Date' || node.text === 'performance' || node.text === 'requestAnimationFrame' || node.text === 'setTimeout' || node.text === 'setInterval' || node.text === 'timeStamp') {
        report(node, node.text);
      }
    }
    if (ts.isPropertyAccessExpression(node) && propertyName(node.name) === 'currentTime' && node.expression.getText(source).includes('AudioContext')) {
      report(node.name, 'AudioContext.currentTime');
    }
    visitChildren(node, visit);
  };
  visit(source);
  return findings;
};

const visitChildren = (node, visit) => ts.forEachChild(node, visit);

const localImports = (file, text) => {
  const source = sourceAst(file, text);
  const found = [];
  const visit = (node) => {
    let specifier;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      specifier = node.arguments[0].text;
    }
    if (specifier?.startsWith('.')) found.push(resolve(dirname(file), specifier));
    visitChildren(node, visit);
  };
  visit(source);
  return found;
};

const resolveSource = (path) => {
  for (const candidate of [path, ...[...CODE_EXTENSIONS].map((ext) => `${path}${ext}`), ...[...CODE_EXTENSIONS].map((ext) => join(path, `index${ext}`))]) {
    try { if (extname(candidate) && CODE_EXTENSIONS.has(extname(candidate)) && readFileSync(candidate)) return candidate; } catch {}
  }
  return undefined;
};

export const temporalNameFindings = (file, text, mode = 'source') => {
  const source = sourceAst(file, text);
  const findings = [];
  const check = (name, node) => {
    if (name !== 'workTimeBonus' && TEMPORAL_NAME.test(name) && !CLOCK_UNIT.test(name)) {
      findings.push(`${file}:${lineOf(source, node)}: temporal field "${name}" must include a clock and unit`);
    }
  };
  const visit = (node) => {
    if (mode === 'json' && ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name) check(name, node.name);
    } else if (mode === 'source' && ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (name) check(name, node.name);
    } else if (mode === 'catalogue' && ts.isStringLiteral(node) && node.parent && ts.isPropertyAssignment(node.parent) && propertyName(node.parent.name) === 'path') {
      check(node.text.split('.').at(-1) ?? node.text, node);
    }
    visitChildren(node, visit);
  };
  visit(source);
  return findings;
};

const brandedClock = (node, source, declaredBrands) => {
  if (!node) return undefined;
  if (ts.isParenthesizedExpression(node)) return brandedClock(node.expression, source, declaredBrands);
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) return brandedClock(node.expression, source, declaredBrands);
  if (ts.isIdentifier(node)) return declaredBrands.get(node.text) ?? (ts.isVariableDeclaration(node.parent) && node.parent.initializer ? brandedClock(node.parent.initializer, source, declaredBrands) : undefined);
  if (ts.isCallExpression(node)) {
    const name = node.expression.getText(source);
    const clock = /^(sim|game|real)(?:Seconds|Timestamp|Rate|TimeOfDay)$/.exec(name)?.[1];
    return clock ? `${clock[0].toUpperCase()}${clock.slice(1)}` : undefined;
  }
  return undefined;
};

export const mixedArithmeticFindings = (file, text) => {
  const source = sourceAst(file, text);
  const findings = [];
  const declaredBrands = new Map();
  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.type && ts.isTypeReferenceNode(node.type)) {
      const clock = /^(Sim|Game|Real)(?:Seconds|Timestamp|Rate|TimeOfDay)$/.exec(node.type.typeName.getText(source))?.[1];
      if (clock) declaredBrands.set(node.name.text, clock);
    }
    visitChildren(node, collect);
  };
  collect(source);
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && [
      ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.LessThanToken,
      ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken,
    ].includes(node.operatorToken.kind)) {
      const left = brandedClock(node.left, source, declaredBrands);
      const right = brandedClock(node.right, source, declaredBrands);
      if (left && right && left !== right) findings.push(`${file}:${lineOf(source, node)}: arithmetic/comparison mixes ${left} and ${right} clocks`);
    }
    visitChildren(node, visit);
  };
  visit(source);
  return findings;
};

const normalizedPath = (path) => path.replaceAll('[]', '');

const temporalCatalogueFindings = (contentFiles, catalogueFile) => {
  const catalogueSource = sourceAst(catalogueFile, readFileSync(catalogueFile, 'utf8'));
  const known = new Set();
  const findPaths = (node) => {
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'path' && ts.isStringLiteral(node.initializer)) {
      known.add(normalizedPath(node.initializer.text));
    }
    visitChildren(node, findPaths);
  };
  findPaths(catalogueSource);
  const findings = [];
  const collect = (value, path, file) => {
    if (Array.isArray(value)) {
      value.forEach((item) => collect(item, `${path}[]`, file));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
      const fieldPath = path ? `${path}.${name}` : name;
      if (TEMPORAL_NAME.test(name) && !CLOCK_UNIT.test(name)) continue;
      if (TEMPORAL_NAME.test(name)) {
        const normalized = normalizedPath(fieldPath);
        if (!known.has(normalized)) findings.push(`${file}: temporal field path "${fieldPath}" is missing from the temporal catalogue`);
      }
      collect(child, fieldPath, file);
    }
  };
  for (const file of contentFiles) {
    const json = JSON.parse(readFileSync(file, 'utf8'));
    collect(json, '', file);
  }
  return findings;
};

export const analyzeFiles = (files, read = readFileSync) => {
  const findings = [];
  for (const file of files) {
    const text = read(file, 'utf8');
    findings.push(...realClockFindings(file, text));
  }
  return findings;
};

export const lint = () => {
  const files = walkFiles(join(SOURCE, 'core'), (path) => CODE_EXTENSIONS.has(extname(path)));
  const visited = new Set();
  const queue = [...files];
  while (queue.length) {
    const file = queue.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    try {
      const text = readFileSync(file, 'utf8');
      for (const imported of localImports(file, text)) {
        const resolved = resolveSource(imported);
        if (resolved && resolved.startsWith(SOURCE)) queue.push(resolved);
      }
    } catch {}
  }
  const findings = [...analyzeFiles([...visited])];
  const temporalFiles = [
    ...walkFiles(CONTENT, (path) => extname(path) === '.json'),
    join(SOURCE, 'core', 'schema.ts'),
    join(SOURCE, 'core', 'temporalFields.ts'),
  ];
  for (const file of temporalFiles) {
    const text = readFileSync(file, 'utf8');
    const mode = file.endsWith('.json') ? 'json' : file.endsWith('temporalFields.ts') ? 'catalogue' : 'source';
    findings.push(...temporalNameFindings(file, text, mode));
  }
  findings.push(...temporalCatalogueFindings(walkFiles(CONTENT, (path) => extname(path) === '.json'), join(SOURCE, 'core', 'temporalFields.ts')));
  if (findings.length) {
    console.error(findings.join('\n'));
    return false;
  }
  console.log(`Time lint passed (${visited.size} simulation dependency modules and temporal schemas/content)`);
  return true;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!lint()) process.exitCode = 1;
}
