// biome-ignore-all lint/correctness/noNodejsModules: This Node-only tool scans source files during CI and local checks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TEMPORAL_FIELDS } from '../src/core/temporalFields.ts';
import ts from './lit-check/node_modules/typescript/lib/typescript.js';

const DEADVOX = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SOURCE = join(DEADVOX, 'src');
const CONTENT = join(SOURCE, 'content', 'base');
const RUNTIME_BASELINE = join(DEADVOX, 'tools', 'time-lint-baseline.json');
const ALLOW_REAL = new Set([join(SOURCE, 'game', 'frameDriver.ts')]);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const REAL_NAMES = new Set(['Date', 'performance', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'timeStamp']);
const NAME_TOKEN = /[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|[0-9]+/g;
const CLOCK_TOKENS = new Set(['sim', 'game', 'real']);
const UNIT_TOKENS = new Set(['ms', 'milliseconds', 'seconds', 'minutes', 'hours', 'rpm', 'timestamp']);
const TEMPORAL_SEMANTIC =
  /(?:time|duration|elapsed|interval|cooldown|windup|burntime|burnremaining|rotsafter|lastplayedat|startedat|expiresat|litat|timestamp)/;
const nameTokens = (name) => (name.match(NAME_TOKEN) ?? []).map((token) => token.toLowerCase());
const isUnitToken = (tokens, index) => {
  const token = tokens[index];
  if (UNIT_TOKENS.has(token) || ['minute', 'hour'].includes(token)) {
    return true;
  }
  return (
    token === 'second' &&
    (tokens[index - 1] === 'per' || (CLOCK_TOKENS.has(tokens[index - 1]) && tokens[index - 2] === 'per'))
  );
};
const hasTemporalName = (name) => {
  const tokens = nameTokens(name);
  return tokens.some((_, index) => isUnitToken(tokens, index)) || TEMPORAL_SEMANTIC.test(tokens.join(''));
};
const hasClockUnit = (name) => {
  const tokens = nameTokens(name);
  const units = tokens.flatMap((_, index) => (isUnitToken(tokens, index) ? [index] : []));
  const timeOfDay = tokens.some(
    (token, index) => CLOCK_TOKENS.has(token) && tokens.slice(index + 1, index + 4).join('') === 'timeofday',
  );
  return units.length > 0 ? units.every((index) => CLOCK_TOKENS.has(tokens[index - 1])) : timeOfDay;
};
const AUDIO_CONTEXT_TYPE = /^(?:AudioContext|BaseAudioContext)$/;
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
const checkerPrograms = new Map();
const typeProgram = (file) => {
  const absolute = resolve(file);
  const fixtureRoot = join(DEADVOX, 'test', 'fixtures', 'time-lint');
  const fixture = absolute.startsWith(`${fixtureRoot}/`);
  const key = fixture ? absolute : 'runtime';
  let program = checkerPrograms.get(key);
  if (!program) {
    const roots = fixture
      ? [absolute]
      : [
          ...walkFiles(SOURCE, (path) => ['.ts', '.tsx'].includes(extname(path))),
          ...walkFiles(fixtureRoot, (path) => path.endsWith('.ts')),
        ];
    program = ts.createProgram(roots, {
      allowImportingTsExtensions: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest,
    });
    checkerPrograms.set(key, program);
  }
  return { checker: program.getTypeChecker(), source: program.getSourceFile(absolute) };
};
const propertyName = (node) =>
  ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

const realClockFindings = (file, text) => {
  if (ALLOW_REAL.has(file)) {
    return [];
  }
  const typed = typeProgram(file);
  const source = typed.source ?? sourceAst(file, text);
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
    if (ts.isPropertyAccessExpression(node) && propertyName(node.name) === 'currentTime') {
      const receiver = typed.checker.getTypeAtLocation(node.expression);
      const receiverName =
        receiver.aliasSymbol?.name ?? receiver.getSymbol()?.name ?? typed.checker.typeToString(receiver);
      if (AUDIO_CONTEXT_TYPE.test(receiverName)) {
        report(node.name, 'AudioContext.currentTime');
      }
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
  if (
    (mode === 'json' && ts.isPropertyAssignment(node)) ||
    (mode === 'source' &&
      (ts.isPropertyAssignment(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)))
  ) {
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
    if (field && hasTemporalName(field.name) && !hasClockUnit(field.name)) {
      findings.push(
        `${file}:${lineOf(source, field.node)}: temporal field "${field.name}" must include a clock and unit`,
      );
    }
    visitChildren(node, visit);
  };
  visit(source);
  return findings;
};

const clockFromType = (checker, node) => {
  const type = checker.getTypeAtLocation(node);
  const name = type.aliasSymbol?.name ?? type.getSymbol()?.name;
  return name ? BRANDED_TYPE.exec(name)?.[1] : undefined;
};

export const mixedArithmeticFindings = (file, text) => {
  const typed = typeProgram(file);
  const source = typed.source ?? sourceAst(file, text);
  const findings = [];
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
      const left = clockFromType(typed.checker, node.left);
      const right = clockFromType(typed.checker, node.right);
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

const ambiguousTemporalProperty = (node) => {
  if (!(ts.isPropertyAssignment(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))) {
    return;
  }
  const name = propertyName(node.name);
  return name && hasTemporalName(name) && !hasClockUnit(name) ? name : undefined;
};

export const runtimeTemporalCounts = (files, read = readFileSync) => {
  const counts = new Map();
  for (const file of files) {
    const source = sourceAst(file, read(file, 'utf8'));
    const visit = (node) => {
      const name = ambiguousTemporalProperty(node);
      if (name) {
        const relativeFile = file.startsWith(SOURCE) ? file.slice(SOURCE.length + 1) : file;
        const key = `${relativeFile}\\0${name}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      visitChildren(node, visit);
    };
    visit(source);
  }
  return [...counts]
    .map(([key, count]) => {
      const [file, name] = key.split('\\0');
      return { file, name, count };
    })
    .sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
};

export const compareRuntimeTemporalCounts = (observed, baseline) => {
  const keyOf = ({ file, name }) => `${file}\\0${name}`;
  const actual = new Map(observed.map((entry) => [keyOf(entry), entry.count]));
  const expected = new Map(baseline.map((entry) => [keyOf(entry), entry.count]));
  const differences = [];
  for (const [key, count] of actual) {
    const allowed = expected.get(key) ?? 0;
    if (count > allowed) {
      const [file, name] = key.split('\\0');
      differences.push({ kind: 'new', file, name, count: count - allowed });
    }
  }
  for (const [key, count] of expected) {
    const found = actual.get(key) ?? 0;
    if (count > found) {
      const [file, name] = key.split('\\0');
      differences.push({ kind: 'stale', file, name, count: count - found });
    }
  }
  return differences.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.file.localeCompare(b.file) || a.name.localeCompare(b.name),
  );
};

const runtimeSourceFiles = () =>
  walkFiles(SOURCE, (path) => CODE_EXTENSIONS.has(extname(path))).filter(
    (path) => path !== join(SOURCE, 'core', 'schema.ts') && path !== join(SOURCE, 'core', 'temporalFields.ts'),
  );

const runtimeTemporalFindings = () => {
  const files = runtimeSourceFiles();
  const baseline = JSON.parse(readFileSync(RUNTIME_BASELINE, 'utf8'));
  if (
    baseline.version !== 1 ||
    !baseline.fields ||
    typeof baseline.fields !== 'object' ||
    Array.isArray(baseline.fields)
  ) {
    throw new Error('time-lint-baseline.json must have version 1 and a fields object');
  }
  const baselineFields = Object.entries(baseline.fields).flatMap(([file, names]) =>
    Object.entries(names).map(([name, count]) => ({ file, name, count })),
  );
  return compareRuntimeTemporalCounts(runtimeTemporalCounts(files), baselineFields).map(
    ({ kind, file, name, count }) => `${kind} runtime temporal name ${file}:${name} (${count})`,
  );
};

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
    const temporalName = hasTemporalName(name);
    if (temporalName && hasClockUnit(name) && !state.known.has(normalizedPath(fieldPath))) {
      state.findings.push(`${file}: temporal field path "${fieldPath}" is missing from the temporal catalogue`);
    }
    collectAuthoredFields(child, fieldPath, file, state);
  }
};

const temporalCatalogueFindings = (contentFiles) => {
  const known = new Set(TEMPORAL_FIELDS.map(({ path }) => normalizedPath(path)));
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
  findings.push(...temporalCatalogueFindings(contentFiles));
  return findings;
};

export const lint = () => {
  const modules = simulationDependencies();
  const findings = [...analyzeFiles(modules), ...authoredTemporalFindings(), ...runtimeTemporalFindings()];
  if (findings.length > 0) {
    process.stderr.write(`${findings.join('\n')}\n`);
    return false;
  }
  process.stdout.write(
    `Time lint passed (${modules.length} simulation dependency modules and temporal schemas/content)\n`,
  );
  return true;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--emit-runtime-baseline')) {
    const fields = {};
    for (const { file, name, count } of runtimeTemporalCounts(runtimeSourceFiles())) {
      fields[file] ??= {};
      fields[file][name] = count;
    }
    process.stdout.write(`${JSON.stringify({ version: 1, fields }, null, 2)}\n`);
  } else if (!lint()) {
    process.exitCode = 1;
  }
}
