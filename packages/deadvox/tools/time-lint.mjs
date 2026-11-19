// biome-ignore-all lint/correctness/noNodejsModules: This Node-only tool scans source files during CI and local checks.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compareCodeUnits, TEMPORAL_FIELDS } from '@skelly/engine/packs';
import ts from '../../../tools/lit-check/node_modules/typescript/lib/typescript.js';

/** @typedef {(path: string, encoding: 'utf8') => string} ReadText */
/** @typedef {'source' | 'json' | 'catalogue'} TemporalMode */
/** @typedef {{ file: string; name: string; count: number }} RuntimeTemporalCount */
/** @typedef {RuntimeTemporalCount & { kind: 'new' | 'stale' }} RuntimeTemporalDifference */
/** @typedef {Record<string, Record<string, number>>} RuntimeBaselineFields */
/** @typedef {{ known: ReadonlySet<string>; findings: string[] }} CatalogueState */

const DEADVOX = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SOURCE = join(DEADVOX, 'src');
// The runtime and presentation packages' source; their files are keyed relative to it, as deadvox's are to SOURCE.
const ENGINE = join(DEADVOX, '..', 'engine', 'src');
const PRESENTATION = join(DEADVOX, '..', 'presentation', 'src');
const SOURCES = [SOURCE, ENGINE, PRESENTATION];
/** @param {string} file */
const sourceRelative = (file) => {
  const root = SOURCES.find((dir) => file.startsWith(`${dir}/`));
  return root ? file.slice(root.length + 1) : file;
};
const CONTENT_ROOTS = [join(DEADVOX, 'mods'), join(DEADVOX, '..', 'mods')];
const RUNTIME_BASELINE = join(DEADVOX, 'tools', 'time-lint-baseline.json');
const ALLOW_REAL = new Set([join(SOURCE, 'game', 'frameDriver.ts')]);
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs']);
const REAL_NAMES = new Set(['Date', 'performance', 'requestAnimationFrame', 'setTimeout', 'setInterval', 'timeStamp']);
const NAME_TOKEN = /[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|[0-9]+/g;
const CLOCK_TOKENS = new Set(['sim', 'game', 'real']);
const UNIT_TOKENS = new Set(['ms', 'milliseconds', 'seconds', 'minutes', 'hours', 'rpm', 'timestamp']);
const TEMPORAL_SEMANTIC =
  /(?:time|duration|elapsed|interval|cooldown|windup|burntime|burnremaining|rotsafter|lastplayedat|startedat|expiresat|litat|timestamp)/;
/** @param {string} name */
const nameTokens = (name) => (name.match(NAME_TOKEN) ?? []).map((token) => token.toLowerCase());
/** @param {string | undefined} token */
const isClockToken = (token) => token !== undefined && CLOCK_TOKENS.has(token);
/**
 * @param {readonly string[]} tokens
 * @param {number} index
 */
const isUnitToken = (tokens, index) => {
  const token = tokens[index];
  if (token === undefined) {
    return false;
  }
  if (UNIT_TOKENS.has(token) || ['minute', 'hour'].includes(token)) {
    return true;
  }
  return (
    token === 'second' &&
    (tokens[index - 1] === 'per' || (isClockToken(tokens[index - 1]) && tokens[index - 2] === 'per'))
  );
};
/** @param {string} name */
const hasTemporalName = (name) => {
  // Path-keyed records identify assets rather than naming temporal quantities.
  if (name.includes('/')) {
    return false;
  }
  // The shared motion export names a timeline leg's duration `seconds`; every leg is on the sim clock.
  if (name === 'seconds') {
    return false;
  }
  const tokens = nameTokens(name);
  return tokens.some((_, index) => isUnitToken(tokens, index)) || TEMPORAL_SEMANTIC.test(tokens.join(''));
};
/** @param {string} name */
const hasClockUnit = (name) => {
  const tokens = nameTokens(name);
  const units = tokens.flatMap((_, index) => (isUnitToken(tokens, index) ? [index] : []));
  const timeOfDay = tokens.some(
    (token, index) => isClockToken(token) && tokens.slice(index + 1, index + 4).join('') === 'timeofday',
  );
  return units.length > 0 ? units.every((index) => isClockToken(tokens[index - 1])) : timeOfDay;
};
const AUDIO_CONTEXT_TYPE = /^(?:AudioContext|BaseAudioContext)$/;
const BRANDED_TYPE = /^(Sim|Game|Real)(?:Seconds|Timestamp|Rate|TimeOfDay)$/;

/**
 * @param {string} dir
 * @param {(path: string) => boolean} accept
 * @returns {string[]}
 */
const walkFiles = (dir, accept) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(path, accept);
    }
    return accept(path) ? [path] : [];
  });
/**
 * @param {string} file
 * @param {string} text
 */
const sourceAst = (file, text) =>
  ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.json') ? ts.ScriptKind.JSON : ts.ScriptKind.TS,
  );
/** @type {Map<string, ts.Program>} */
const checkerPrograms = new Map();
/** @param {string} file */
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
          ...SOURCES.flatMap((dir) => walkFiles(dir, (path) => ['.ts', '.tsx'].includes(extname(path)))),
          ...walkFiles(fixtureRoot, (path) => path.endsWith('.ts')),
        ];
    program = ts.createProgram(roots, {
      allowImportingTsExtensions: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      target: ts.ScriptTarget.Latest,
      ...(fixture ? { types: [] } : {}),
    });
    checkerPrograms.set(key, program);
  }
  return { checker: program.getTypeChecker(), source: program.getSourceFile(absolute) };
};
/** @param {ts.Node} node */
const propertyName = (node) =>
  ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node) ? node.text : undefined;
/**
 * @param {ts.SourceFile} source
 * @param {ts.Node} node
 */
const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

/**
 * @param {string} file
 * @param {string} text
 */
const realClockFindings = (file, text) => {
  if (ALLOW_REAL.has(file)) {
    return [];
  }
  const typed = typeProgram(file);
  const source = typed.source ?? sourceAst(file, text);
  /** @type {string[]} */
  const findings = [];
  /**
   * @param {ts.Node} node
   * @param {string} name
   */
  const report = (node, name) =>
    findings.push(
      `${file}:${lineOf(source, node)}: Real clock/API ${name} is not allowed in the simulation dependency graph`,
    );
  /** @param {ts.Node} node */
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

/**
 * @param {ts.Node} node
 * @param {(node: ts.Node) => void} visit
 */
const visitChildren = (node, visit) => ts.forEachChild(node, visit);

/**
 * @param {string} file
 * @param {string} text
 */
const localImports = (file, text) => {
  const source = sourceAst(file, text);
  /** @type {string[]} */
  const found = [];
  /** @param {ts.Node} node */
  const visit = (node) => {
    /** @type {string | undefined} */
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifier = node.moduleSpecifier.text;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        specifier = argument.text;
      }
    }
    if (specifier?.startsWith('.')) {
      found.push(resolve(dirname(file), specifier));
    }
    visitChildren(node, visit);
  };
  visit(source);
  return found;
};

/** @param {string} path */
const resolveSource = (path) =>
  [
    path,
    ...[...CODE_EXTENSIONS].map((ext) => `${path}${ext}`),
    ...[...CODE_EXTENSIONS].map((ext) => join(path, `index${ext}`)),
  ].find((candidate) => CODE_EXTENSIONS.has(extname(candidate)) && existsSync(candidate));

/**
 * @param {ts.Node} node
 * @param {TemporalMode} mode
 */
const temporalNameField = (node, mode) => {
  if (
    (mode === 'json' && ts.isPropertyAssignment(node)) ||
    (mode === 'source' &&
      (ts.isPropertyAssignment(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)))
  ) {
    const name = propertyName(node.name);
    return name ? { name, node: node.name } : undefined;
  }
  const cataloguePath =
    mode === 'catalogue' &&
    ts.isStringLiteral(node) &&
    node.parent &&
    ts.isPropertyAssignment(node.parent) &&
    propertyName(node.parent.name) === 'path';
  return cataloguePath ? { name: node.text.split('.').at(-1) ?? node.text, node } : undefined;
};

/**
 * @param {string} file
 * @param {string} text
 * @param {TemporalMode} [mode]
 */
export const temporalNameFindings = (file, text, mode = 'source') => {
  const source = sourceAst(file, text);
  /** @type {string[]} */
  const findings = [];
  /** @param {ts.Node} node */
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

/**
 * @param {ts.TypeChecker} checker
 * @param {ts.Node} node
 */
const clockFromType = (checker, node) => {
  const type = checker.getTypeAtLocation(node);
  const name = type.aliasSymbol?.name ?? type.getSymbol()?.name;
  return name ? BRANDED_TYPE.exec(name)?.[1] : undefined;
};

/**
 * @param {string} file
 * @param {string} text
 */
export const mixedArithmeticFindings = (file, text) => {
  const typed = typeProgram(file);
  const source = typed.source ?? sourceAst(file, text);
  /** @type {string[]} */
  const findings = [];
  /** @param {ts.Node} node */
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

/** @param {string} path */
const normalizedPath = (path) => path.replaceAll('[]', '');

/**
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
const ambiguousTemporalProperty = (node) => {
  if (!(ts.isPropertyAssignment(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))) {
    return;
  }
  const name = propertyName(node.name);
  return name && hasTemporalName(name) && !hasClockUnit(name) ? name : undefined;
};

/** @param {Pick<RuntimeTemporalCount, 'file' | 'name'>} entry */
const runtimeKey = ({ file, name }) => `${file}\\0${name}`;

/**
 * @param {readonly string[]} files
 * @param {ReadText} [read]
 * @returns {RuntimeTemporalCount[]}
 */
export const runtimeTemporalCounts = (files, read = readFileSync) => {
  /** @type {Map<string, RuntimeTemporalCount>} */
  const counts = new Map();
  for (const file of files) {
    const source = sourceAst(file, read(file, 'utf8'));
    /** @param {ts.Node} node */
    const visit = (node) => {
      const name = ambiguousTemporalProperty(node);
      if (name) {
        const entry = { file: sourceRelative(file), name, count: 1 };
        const counted = counts.get(runtimeKey(entry));
        if (counted) {
          counted.count += 1;
        } else {
          counts.set(runtimeKey(entry), entry);
        }
      }
      visitChildren(node, visit);
    };
    visit(source);
  }
  return [...counts.values()].sort((a, b) => compareCodeUnits(a.file, b.file) || compareCodeUnits(a.name, b.name));
};

/**
 * @param {readonly RuntimeTemporalCount[]} observed
 * @param {readonly RuntimeTemporalCount[]} baseline
 * @returns {RuntimeTemporalDifference[]}
 */
export const compareRuntimeTemporalCounts = (observed, baseline) => {
  const actual = new Map(observed.map((entry) => [runtimeKey(entry), entry]));
  const expected = new Map(baseline.map((entry) => [runtimeKey(entry), entry]));
  /** @type {RuntimeTemporalDifference[]} */
  const differences = [];
  for (const [key, { file, name, count }] of actual) {
    const allowed = expected.get(key)?.count ?? 0;
    if (count > allowed) {
      differences.push({ kind: 'new', file, name, count: count - allowed });
    }
  }
  for (const [key, { file, name, count }] of expected) {
    const found = actual.get(key)?.count ?? 0;
    if (count > found) {
      differences.push({ kind: 'stale', file, name, count: count - found });
    }
  }
  return differences.sort(
    (a, b) => compareCodeUnits(a.kind, b.kind) || compareCodeUnits(a.file, b.file) || compareCodeUnits(a.name, b.name),
  );
};

const runtimeSourceFiles = () =>
  SOURCES.flatMap((dir) => walkFiles(dir, (path) => CODE_EXTENSIONS.has(extname(path)))).filter(
    (path) => path !== join(ENGINE, 'core', 'schema.ts') && path !== join(ENGINE, 'core', 'temporalFields.ts'),
  );

const runtimeTemporalFindings = () => {
  const files = runtimeSourceFiles();
  // The baseline is this tool's own --emit-runtime-baseline output, so only its envelope is checked.
  const baseline = /** @type {{ version?: unknown; fields?: RuntimeBaselineFields | unknown[] }} */ (
    JSON.parse(readFileSync(RUNTIME_BASELINE, 'utf8'))
  );
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

/**
 * @param {ReadonlySet<string>} known
 * @param {string} path
 */
const catalogueHas = (known, path) => {
  const parts = normalizedPath(path).split('.');
  return [...known].some((entry) => {
    const pattern = entry.split('.');
    return pattern.length === parts.length && pattern.every((part, index) => part === '*' || part === parts[index]);
  });
};

/**
 * @param {unknown} value
 * @param {string} path
 * @param {string} file
 * @param {CatalogueState} state
 */
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
    if (temporalName && hasClockUnit(name) && !catalogueHas(state.known, fieldPath)) {
      state.findings.push(`${file}: temporal field path "${fieldPath}" is missing from the temporal catalogue`);
    }
    collectAuthoredFields(child, fieldPath, file, state);
  }
};

/**
 * A parsed JSON value's temporal keys that name no clock and unit, for declared files outside the content roots.
 * @param {string} file
 * @param {unknown} value
 */
export const temporalKeyFindings = (file, value) => {
  /** @type {string[]} */
  const findings = [];
  /** @param {unknown} node */
  const visit = (node) => {
    if (!node || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    for (const [name, child] of Object.entries(node)) {
      if (hasTemporalName(name) && !hasClockUnit(name)) {
        findings.push(`${file}: temporal field "${name}" must include a clock and unit`);
      }
      visit(child);
    }
  };
  visit(value);
  return findings;
};

/**
 * @param {readonly string[]} contentFiles
 * @param {ReadText} [read]
 */
export const temporalCatalogueFindings = (contentFiles, read = readFileSync) => {
  const known = new Set(TEMPORAL_FIELDS.map(({ path }) => normalizedPath(path)));
  /** @type {CatalogueState} */
  const state = { known, findings: [] };
  for (const file of contentFiles) {
    // Standalone ModelSchema records share the pack namespace rather than a second temporal catalogue.
    const path = file.endsWith('.model.json') ? 'models' : '';
    collectAuthoredFields(JSON.parse(read(file, 'utf8')), path, file, state);
  }
  return state.findings;
};

/**
 * @param {readonly string[]} files
 * @param {ReadText} [read]
 */
export const analyzeFiles = (files, read = readFileSync) => {
  /** @type {string[]} */
  const findings = [];
  for (const file of files) {
    const text = read(file, 'utf8');
    findings.push(...realClockFindings(file, text));
  }
  return findings;
};

const simulationDependencies = () => {
  const queue = walkFiles(join(ENGINE, 'core'), (path) => CODE_EXTENSIONS.has(extname(path)));
  /** @type {Set<string>} */
  const visited = new Set();
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) {
      continue;
    }
    visited.add(file);
    for (const imported of localImports(file, readFileSync(file, 'utf8'))) {
      const resolved = resolveSource(imported);
      if (resolved && SOURCES.some((dir) => resolved.startsWith(`${dir}/`))) {
        queue.push(resolved);
      }
    }
  }
  return [...visited];
};

/**
 * @param {string} file
 * @returns {TemporalMode}
 */
const temporalFileMode = (file) => {
  if (file.endsWith('.json')) {
    return 'json';
  }
  return file.endsWith('temporalFields.ts') ? 'catalogue' : 'source';
};

const authoredTemporalFindings = () => {
  const contentFiles = CONTENT_ROOTS.flatMap((root) => walkFiles(root, (path) => extname(path) === '.json'));
  const catalogueFile = join(ENGINE, 'core', 'temporalFields.ts');
  const temporalFiles = [...contentFiles, join(ENGINE, 'core', 'schema.ts'), catalogueFile];
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
    /** @type {RuntimeBaselineFields} */
    const fields = {};
    for (const { file, name, count } of runtimeTemporalCounts(runtimeSourceFiles())) {
      const fileFields = fields[file] ?? {};
      fileFields[name] = count;
      fields[file] = fileFields;
    }
    process.stdout.write(`${JSON.stringify({ version: 1, fields }, null, 2)}\n`);
  } else if (!lint()) {
    process.exitCode = 1;
  }
}
