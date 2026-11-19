// biome-ignore-all lint/correctness/noNodejsModules: Build-time dependency check, not game runtime.
// The Work on screen serves any kind of worked model through its site value, so no housing type may reach it, even
// re-exported through a barrel; each imported name is resolved to the file that declares it.
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from '../../../tools/lit-check/node_modules/typescript/lib/typescript.js';

const presentation = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(presentation, '../..');
const engine = join(repository, 'packages/engine/src');
export const screenFiles = [
  'ui/crafting.ts',
  'ui/craftController.ts',
  'ui/craftReadout.ts',
  'ui/workSite.ts',
  'render/slotSockets.ts',
].map((path) => join(presentation, 'src', path));
const housing = new Set(
  ['schema/furniture.ts', 'housing.ts', 'partService.ts'].map((path) => join(engine, 'core', path)),
);
const startHandle = { file: join(engine, 'game/replayCommands.ts'), name: 'ReplayActionPayload' };
/** @param {string} path */
const shown = (path) => relative(repository, path);

const configFile = ts.readConfigFile(join(presentation, 'tsconfig.json'), ts.sys.readFile);
const { options } = ts.parseJsonConfigFileContent(configFile.config, ts.sys, presentation);

/**
 * A compiler host that reads each overlaid source in place of the file at its path, whether or not one exists.
 * @param {ReadonlyMap<string, string>} overlay
 * @returns {ts.CompilerHost}
 */
const overlaidHost = (overlay) => {
  const host = ts.createCompilerHost(options);
  const directories = new Set([...overlay.keys()].map((file) => dirname(file)));
  return {
    ...host,
    directoryExists: (directory) => directories.has(directory) || (host.directoryExists?.(directory) ?? false),
    fileExists: (file) => overlay.has(file) || host.fileExists(file),
    readFile: (file) => overlay.get(file) ?? host.readFile(file),
    realpath: (file) => (overlay.has(file) ? file : (host.realpath?.(file) ?? file)),
    getSourceFile: (file, language, ...rest) => {
      const text = overlay.get(file);
      return text === undefined
        ? host.getSourceFile(file, language, ...rest)
        : ts.createSourceFile(file, text, language);
    },
  };
};

/** @typedef {{ file: string; line: number; name: string; housing: string }} HousingReach */
/** @param {HousingReach} reach */
const formatReach = (reach) => `${reach.file}:${reach.line} ${reach.name} -> ${reach.housing}`;

/**
 * Every place the given modules reach a housing type, with paths relative to the repository.
 * @param {readonly string[]} files the modules to check
 * @param {ReadonlyMap<string, string>} [overlay] sources read in place of the files at their paths
 * @returns {HousingReach[]}
 */
export const housingReaches = (files, overlay = new Map()) => {
  const host = overlaidHost(overlay);
  const program = ts.createProgram(files, options, host);
  const checker = program.getTypeChecker();
  /** @param {string} file */
  const realpath = (file) => host.realpath?.(file) ?? file;
  /** @param {string} file */
  const isHousing = (file) => housing.has(realpath(file));
  /**
   * The controller forwards a site's Start without inspecting its kind, so the housing command among its members
   * stays opaque to the screen.
   * @param {ts.Declaration} declaration
   */
  const isStartHandle = (declaration) =>
    ts.isTypeAliasDeclaration(declaration) &&
    declaration.name.text === startHandle.name &&
    realpath(declaration.getSourceFile().fileName) === startHandle.file;
  /**
   * The symbols a type alias is derived from.
   * @param {ts.TypeAliasDeclaration} alias
   * @returns {ts.Symbol[]}
   */
  const derivedFrom = (alias) => {
    /** @type {ts.Symbol[]} */
    const used = [];
    /** @param {ts.Node} node */
    const visit = (node) => {
      const symbol = ts.isIdentifier(node) ? checker.getSymbolAtLocation(node) : undefined;
      if (symbol) {
        used.push(symbol);
      }
      ts.forEachChild(node, visit);
    };
    visit(alias.type);
    return used;
  };
  /**
   * The housing file a symbol is declared in, or that a type alias of it is derived from, such as `FurnitureDef` from
   * `FurnitureSchema`.
   * @param {ts.Symbol} symbol
   * @param {Set<ts.Symbol>} seen
   * @returns {string | undefined}
   */
  const housingSource = (symbol, seen = new Set()) => {
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const declarations = seen.has(resolved) ? [] : (resolved.declarations ?? []);
    seen.add(resolved);
    /** @type {string | undefined} */
    let found;
    for (const declaration of declarations.filter((candidate) => !isStartHandle(candidate))) {
      const file = declaration.getSourceFile().fileName;
      const derived =
        ts.isTypeAliasDeclaration(declaration) && !file.includes('/node_modules/') ? derivedFrom(declaration) : [];
      found ??= isHousing(file) ? file : derived.map((used) => housingSource(used, seen)).find(Boolean);
    }
    return found;
  };
  /**
   * The module a node names: an import or export's source, an import type's argument or a dynamic import's argument.
   * @param {ts.Node} node
   * @returns {ts.Node | undefined}
   */
  const moduleNamed = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      return node.moduleSpecifier;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      return node.argument.literal;
    }
    return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      ? node.arguments[0]
      : undefined;
  };
  /**
   * The housing file a node reaches: the module it names, or the declaration an imported name resolves to.
   * @param {ts.SourceFile} source
   * @param {ts.Node} node
   * @returns {{ name: string; file: string } | undefined}
   */
  const reached = (source, node) => {
    const specifier = moduleNamed(node);
    if (specifier && ts.isStringLiteral(specifier)) {
      const target = ts.resolveModuleName(specifier.text, source.fileName, options, host).resolvedModule;
      return target && isHousing(target.resolvedFileName)
        ? { name: specifier.text, file: realpath(target.resolvedFileName) }
        : undefined;
    }
    const symbol = ts.isIdentifier(node) ? checker.getSymbolAtLocation(node) : undefined;
    const file = symbol && symbol.flags & ts.SymbolFlags.Alias ? housingSource(symbol) : undefined;
    return file ? { name: /** @type {ts.Identifier} */ (node).text, file: realpath(file) } : undefined;
  };
  /**
   * @param {string} file
   * @returns {HousingReach[]}
   */
  const violations = (file) => {
    const source = program.getSourceFile(file);
    if (!source) {
      throw new Error(`Work site boundary cannot read ${shown(file)}`);
    }
    /** @type {Map<string, HousingReach>} */
    const found = new Map();
    /** @param {ts.Node} node */
    const visit = (node) => {
      const housingFile = reached(source, node);
      if (housingFile) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        const reach = { file: shown(file), line: line + 1, name: housingFile.name, housing: shown(housingFile.file) };
        found.set(formatReach(reach), reach);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return [...found.values()];
  };
  return files.flatMap(violations);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const missing = [...screenFiles, ...housing, startHandle.file].filter((file) => !existsSync(file));
  if (missing.length > 0) {
    process.stderr.write(`Work site boundary names files that do not exist: ${missing.map(shown).join(', ')}\n`);
    process.exitCode = 1;
  } else {
    const found = housingReaches(screenFiles);
    if (found.length > 0) {
      process.stderr.write(`The Work on screen reaches housing types:\n${found.map(formatReach).join('\n')}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write('Work site boundary passed.\n');
    }
  }
}
