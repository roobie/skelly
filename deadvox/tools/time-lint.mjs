// biome-ignore-all lint/correctness/noNodejsModules: This Node-only tool scans source files during CI and local checks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from './lit-check/node_modules/typescript/lib/typescript.js';

const DEADVOX = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SOURCE = join(DEADVOX, 'src');
const CONTENT = join(SOURCE, 'content', 'base');
const ALLOW_REAL = new Set([join(SOURCE, 'game', 'frameDriver.ts')]);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const REAL_NAMES = new Set(['Date', 'performance', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'timeStamp']);
const TEMPORAL_NAME =
  /(?:Time|Duration|Interval|Cooldown|Windup|BurnTime|BurnRemaining|RotsAfter|Per(?:Sim|Game|Real)(?:Second|Minute|Hour)|Timestamp)/i;
const CLOCK_UNIT = /(?:Sim|Game|Real)(?:Milliseconds?|Seconds?(?:Squared)?|Minutes?|Hours?|TimeOfDay|Timestamp|Rate)/;
const BRANDED_CLOCK = /^(sim|game|real)(?:Seconds|Timestamp|Rate|TimeOfDay)$/;
const BRANDED_TYPE = /^(Sim|Game|Real)(?:Seconds|Timestamp|Rate|TimeOfDay)$/;

const walkFiles = (dir, accept) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(path, accept);
    }
    return accept(path) ? [path] : [];
  });
const sourceAst = (file, text) =>
  ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.json') ? ts.ScriptKind.JSON : ts.ScriptKind.TS,
  );
const propertyName = (node) =>
  ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

const realClockFindings = (file, text) => {
  if (ALLOW_REAL.has(file)) {
    return [];
  }
  const source = sourceAst(file, text);
  const findings = [];
  const report = (node, name) =>
    findings.push(
      `${file}:${lineOf(source, node)}: Real clock/API ${name} is not allowed in the simulation dependency graph`,
    );
  const visit = (node) => {
    if (
      ts.isIdentifier(node) &&
      REAL_NAMES.has(node.text) &&
      (node.text === 'Date' ||
        node.text === 'performance' ||
        node.text === 'requestAnimationFrame' ||
        node.text === 'setTimeout' ||
        node.text === 'setInterval' ||
        node.text === 'timeStamp')
    ) {
      report(node, node.text);
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      propertyName(node.name) === 'currentTime' &&
      node.expression.getText(source).includes('AudioContext')
    ) {
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
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifier = node.moduleSpecifier.text;
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifier = node.arguments[0].text;
    }
    if (specifier?.startsWith('.')) {
      found.push(resolve(dirname(file), specifier));
    }
    visitChildren(node, visit);
  };
  visit(source);
  return found;
};

const resolveSource = (path) => {
  for (const candidate of [
    path,
    ...[...CODE_EXTENSIONS].map((ext) => `${path}${ext}`),
    ...[...CODE_EXTENSIONS].map((ext) => join(path, `index${ext}`)),
  ]) {
    if (CODE_EXTENSIONS.has(extname(candidate)) && existsSync(candidate)) {
      return candidate;
    }
  }
};

const temporalNameField = (node, mode) => {
  if ((mode === 'json' || mode === 'source') && ts.isPropertyAssignment(node)) {
    const name = propertyName(node.name);
    return name ? { name, node: node.name } : undefined;
  }
  if (
    mode === 'catalogue' &&
    ts.isStringLiteral(node) &&
    node.parent &&
    ts.isPropertyAssignment(node.parent) &&
    propertyName(node.parent.name) === 'path'
  ) {
    return { name: node.text.split('.').at(-1) ?? node.text, node };
  }
};

export const temporalNameFindings = (file, text, mode = 'source') => {
  const source = sourceAst(file, text);
  const findings = [];
  const visit = (node) => {
    const field = temporalNameField(node, mode);
    if (field && field.name !== 'workTimeBonus' && TEMPORAL_NAME.test(field.name) && !CLOCK_UNIT.test(field.name)) {
      findings.push(
        `${file}:${lineOf(source, field.node)}: temporal field "${field.name}" must include a clock and unit`,
      );
    }
    visitChildren(node, visit);
  };
  visit(source);
  return findings;
};

const brandedClock = (node, source, declaredBrands) => {
  if (!node) {
    return;
  }
  if (ts.isParenthesizedExpression(node)) {
    return brandedClock(node.expression, source, declaredBrands);
  }
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return brandedClock(node.expression, source, declaredBrands);
  }
  if (ts.isIdentifier(node)) {
    return (
      declaredBrands.get(node.text) ??
      (ts.isVariableDeclaration(node.parent) && node.parent.initializer
        ? brandedClock(node.parent.initializer, source, declaredBrands)
        : undefined)
    );
  }
  if (ts.isCallExpression(node)) {
    const name = node.expression.getText(source);
    const clock = BRANDED_CLOCK.exec(name)?.[1];
    return clock ? `${clock[0].toUpperCase()}${clock.slice(1)}` : undefined;
  }
};

export const mixedArithmeticFindings = (file, text) => {
  const source = sourceAst(file, text);
  const findings = [];
  const declaredBrands = new Map();
  const collect = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.type &&
      ts.isTypeReferenceNode(node.type)
    ) {
      const clock = BRANDED_TYPE.exec(node.type.typeName.getText(source))?.[1];
      if (clock) {
        declaredBrands.set(node.name.text, clock);
      }
    }
    visitChildren(node, collect);
  };
  collect(source);
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.MinusToken,
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      const left = brandedClock(node.left, source, declaredBrands);
      const right = brandedClock(node.right, source, declaredBrands);
      if (left && right && left !== right) {
        findings.push(`${file}:${lineOf(source, node)}: arithmetic/comparison mixes ${left} and ${right} clocks`);
      }
    }
    visitChildren(node, visit);
  };
  visit(source);
  return findings;
};

const normalizedPath = (path) => path.replaceAll('[]', '');

const collectAuthoredFields = (value, path, file, state) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAuthoredFields(item, `${path}[]`, file, state);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [name, child] of Object.entries(value)) {
    const fieldPath = path ? `${path}.${name}` : name;
    const temporalName = TEMPORAL_NAME.test(name);
    if (temporalName && CLOCK_UNIT.test(name) && !state.known.has(normalizedPath(fieldPath))) {
      state.findings.push(`${file}: temporal field path "${fieldPath}" is missing from the temporal catalogue`);
    }
    collectAuthoredFields(child, fieldPath, file, state);
  }
};

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
  const state = { known, findings: [] };
  for (const file of contentFiles) {
    collectAuthoredFields(JSON.parse(readFileSync(file, 'utf8')), '', file, state);
  }
  return state.findings;
};

export const analyzeFiles = (files, read = readFileSync) => {
  const findings = [];
  for (const file of files) {
    const text = read(file, 'utf8');
    findings.push(...realClockFindings(file, text));
  }
  return findings;
};

const simulationDependencies = () => {
  const queue = walkFiles(join(SOURCE, 'core'), (path) => CODE_EXTENSIONS.has(extname(path)));
  const visited = new Set();
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) {
      continue;
    }
    visited.add(file);
    for (const imported of localImports(file, readFileSync(file, 'utf8'))) {
      const resolved = resolveSource(imported);
      if (resolved?.startsWith(SOURCE)) {
        queue.push(resolved);
      }
    }
  }
  return [...visited];
};

const temporalFileMode = (file) => {
  if (file.endsWith('.json')) {
    return 'json';
  }
  return file.endsWith('temporalFields.ts') ? 'catalogue' : 'source';
};

const authoredTemporalFindings = () => {
  const contentFiles = walkFiles(CONTENT, (path) => extname(path) === '.json');
  const catalogueFile = join(SOURCE, 'core', 'temporalFields.ts');
  const temporalFiles = [...contentFiles, join(SOURCE, 'core', 'schema.ts'), catalogueFile];
  const findings = [];
  for (const file of temporalFiles) {
    findings.push(...temporalNameFindings(file, readFileSync(file, 'utf8'), temporalFileMode(file)));
  }
  findings.push(...temporalCatalogueFindings(contentFiles, catalogueFile));
  return findings;
};

export const lint = () => {
  const modules = simulationDependencies();
  const findings = [...analyzeFiles(modules), ...authoredTemporalFindings()];
  if (findings.length > 0) {
    process.stderr.write(`${findings.join('\n')}\n`);
    return false;
  }
  process.stdout.write(
    `Time lint passed (${modules.length} simulation dependency modules and temporal schemas/content)\n`,
  );
  return true;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && !lint()) {
  process.exitCode = 1;
}
