// biome-ignore-all lint/correctness/noNodejsModules: Build-time dependency check, not game runtime.
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from '../../../tools/lit-check/node_modules/typescript/lib/typescript.js';

const engine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(engine, '../..');
const source = join(engine, 'src');
const renderWorld = join(source, 'game/renderWorld.ts');
const presentation = resolve(engine, '../presentation/src');
const configFile = ts.readConfigFile(join(engine, 'tsconfig.json'), ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, engine).options;
const options = { ...config, customConditions: [...(config.customConditions ?? []), 'skelly-test'] };
/**
 * @param {string} dir
 * @returns {string[]}
 */
const coreFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      return coreFiles(file);
    }
    return file.endsWith('.ts') ? [file] : [];
  });
const roots = [
  ...coreFiles(join(source, 'core')),
  join(source, 'game/session.ts'),
  join(source, 'game/simulationStepper.ts'),
];
/** @param {string} file */
const imports = (file) => {
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  /** @type {string[]} */
  const found = [];
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      found.push(node.argument.literal.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if (!(node.arguments[0] && ts.isStringLiteral(node.arguments[0]))) {
        throw new Error(`Simulation import must be statically resolvable: ${relative(repository, file)}`);
      }
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return found;
};
/** @param {string} file */
const localTargets = (file) =>
  imports(file).flatMap((specifier) => {
    const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
    if (!resolved) {
      if (specifier.startsWith('.') || specifier.startsWith('@skelly/engine/')) {
        throw new Error(`Unresolved simulation dependency: ${relative(repository, file)} -> ${specifier}`);
      }
      return [];
    }
    const target = realpathSync(resolved.resolvedFileName);
    return target.startsWith(`${repository}/packages/`) &&
      ['.ts', '.tsx', '.js', '.mjs'].includes(extname(target)) &&
      !target.endsWith('.d.ts')
      ? [target]
      : [];
  });
/** @type {Set<string>} */
const visited = new Set();
/**
 * @param {string} file
 * @param {readonly string[]} chain
 */
const visit = (file, chain) => {
  if (file === renderWorld || file.startsWith(`${presentation}/`)) {
    throw new Error(
      `Simulation cannot import rendering: ${[...chain, file].map((path) => relative(repository, path)).join(' -> ')}`,
    );
  }
  if (visited.has(file)) {
    return;
  }
  visited.add(file);
  for (const target of localTargets(file)) {
    visit(target, [...chain, file]);
  }
};
try {
  for (const root of roots) {
    visit(root, []);
  }
  process.stdout.write('Simulation/render boundary passed.\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
