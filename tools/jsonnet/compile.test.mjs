import assert from 'node:assert/strict';
import fs, {
  closeSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { compileJsonnetSources, compileOutputs, formatJson, selectWithin } from './compile.mjs';
import { compileJsonnetFile, REPOSITORY_ROOT } from './index.mjs';

const NO_SOURCES = /No Jsonnet sources/;
const CANNOT_CHECK = /cannot be checked/;

test('a partial compile selects only sources inside its directories and refuses an empty selection', () => {
  const files = [
    { source: 'alpha/one.jsonnet', output: 'alpha/one.json' },
    { source: 'alpha/deep/two.jsonnet', output: 'alpha/deep/two.json' },
    { source: 'alphabet/three.jsonnet', output: 'alphabet/three.json' },
    { source: 'beta/four.jsonnet', output: 'beta/four.json' },
  ];
  assert.deepEqual(
    selectWithin(files, ['alpha', 'beta']).map(({ source }) => source),
    ['alpha/one.jsonnet', 'alpha/deep/two.jsonnet', 'beta/four.jsonnet'],
  );
  assert.throws(() => selectWithin(files, ['gamma']), NO_SOURCES);
});

test('a partial compile cannot be checked against the full-set manifest', async () => {
  await assert.rejects(compileJsonnetSources({ within: ['alpha'], check: true }), CANNOT_CHECK);
});

test('formatter preserves a generated document larger than the subprocess default output buffer', () => {
  const document = { rows: Array.from({ length: 16_384 }, () => 'fixture'.repeat(16)) };
  const source = JSON.stringify(document);
  const formatted = formatJson(source, 'packages/deadvox/mods/fixture.pack/fixture.json');
  assert.deepEqual(JSON.parse(formatted), document);
});

const FILES = [
  { source: 'content/main.jsonnet', output: 'content/main.json' },
  { source: 'content/other.jsonnet', output: 'content/other.json' },
];

/** A throwaway repository root: `main` reaches `deep.libsonnet` only through `shared.libsonnet`; `other` does not. */
function withFixture(body) {
  const root = mkdtempSync(join(tmpdir(), 'jsonnet-cache-test-'));
  const cacheDirectory = join(root, 'cache');
  mkdirSync(join(root, 'content/lib'), { recursive: true });
  writeFileSync(join(root, 'content/lib/deep.libsonnet'), '{ value: 1 }\n');
  writeFileSync(join(root, 'content/lib/shared.libsonnet'), "{ deep: import 'deep.libsonnet' }\n");
  writeFileSync(join(root, 'content/main.jsonnet'), "{ value: (import 'lib/shared.libsonnet').deep.value }\n");
  writeFileSync(join(root, 'content/other.jsonnet'), '{ other: true }\n');
  const compile = () => compileOutputs(FILES, { repositoryRoot: root, cacheDirectory });
  const read = (output) => JSON.parse(readFileSync(join(root, output), 'utf8'));
  return Promise.resolve(body({ root, compile, read })).finally(() => rmSync(root, { recursive: true, force: true }));
}

const reusedFlags = (results) => results.map(({ reused }) => reused);

test('an importing compiler sees complete JSON while a generated output is being written', async ({ mock }) =>
  withFixture(async ({ root, compile, read }) => {
    await compile();
    const target = join(root, 'content/other.json');
    const reader = join(root, 'content/reader.jsonnet');
    writeFileSync(reader, "import 'other.json'\n");
    const evaluateReader = () => JSON.parse(compileJsonnetFile(reader, root));
    assert.deepEqual(evaluateReader(), { other: true });
    writeFileSync(join(root, FILES[1].source), '{ other: false }\n');

    const observations = [];
    const originalWrite = fs.writeFileSync;
    mock.method(fs, 'writeFileSync', (path, data, options) => {
      if (typeof path !== 'string' || !path.startsWith(target)) {
        return originalWrite(path, data, options);
      }
      // Force the importing process into the interval after open truncates the write destination, before any bytes.
      const descriptor = openSync(path, 'w');
      try {
        try {
          observations.push(evaluateReader());
        } catch (error) {
          observations.push(error);
        }
        return originalWrite(descriptor, data, options);
      } finally {
        closeSync(descriptor);
      }
    });
    syncBuiltinESMExports();
    try {
      await compileOutputs([FILES[1]], { repositoryRoot: root, cacheDirectory: join(root, 'cache') });
    } finally {
      mock.restoreAll();
      syncBuiltinESMExports();
    }
    assert.deepEqual(observations, [{ other: true }]);
    assert.deepEqual(evaluateReader(), { other: false });
    assert.deepEqual(read(FILES[1].output), { other: false });
  }));

test('a second compile with unchanged inputs reuses every output', () =>
  withFixture(async ({ compile, read }) => {
    assert.deepEqual(reusedFlags(await compile()), [false, false]);
    assert.deepEqual(reusedFlags(await compile()), [true, true]);
    assert.deepEqual(read('content/main.json'), { value: 1 });
  }));

test('editing a transitively imported libsonnet recompiles only the outputs that import it', () =>
  withFixture(async ({ root, compile, read }) => {
    await compile();
    writeFileSync(join(root, 'content/lib/deep.libsonnet'), '{ value: 2 }\n');
    assert.deepEqual(reusedFlags(await compile()), [false, true]);
    assert.deepEqual(read('content/main.json'), { value: 2 });
  }));

const COPIED_FILES = [
  'tools/jsonnet/compile.mjs',
  'tools/jsonnet/index.mjs',
  'tools/jsonnet/runtime.json',
  'biome.jsonc',
  '.gitignore',
];
const LINKED_PATHS = ['node_modules', 'tools/jsonnet/bin', 'tools/lint'];

test('a formatter config added beside a cached output leaves it equal to a cold compile', async () => {
  // The compiler modules run from a throwaway checkout, because the formatter resolves paths against the checkout
  // that holds them; a fixture outside it could not show what the formatter would discover there.
  const root = mkdtempSync(join(tmpdir(), 'jsonnet-format-test-'));
  try {
    mkdirSync(join(root, 'tools/jsonnet'), { recursive: true });
    mkdirSync(join(root, 'content'));
    // An empty marker, never a repository: the formatter's VCS integration needs a root, and no git command runs.
    mkdirSync(join(root, '.git'));
    for (const path of COPIED_FILES) {
      copyFileSync(join(REPOSITORY_ROOT, path), join(root, path));
    }
    for (const path of LINKED_PATHS) {
      symlinkSync(join(REPOSITORY_ROOT, path), join(root, path));
    }
    const compiler = await import(pathToFileURL(join(root, 'tools/jsonnet/compile.mjs')).href);
    const { evaluateJsonnetFile } = await import(pathToFileURL(join(root, 'tools/jsonnet/index.mjs')).href);
    const file = { source: 'content/main.jsonnet', output: 'content/main.json' };
    writeFileSync(join(root, file.source), '{ rows: [std.repeat("row", 8) for _ in std.range(1, 20)] }\n');
    const compile = () =>
      compiler.compileOutputs([file], { repositoryRoot: root, cacheDirectory: join(root, 'cache') });
    await compile();
    writeFileSync(join(root, 'content/biome.json'), '{ "root": false, "formatter": { "indentWidth": 7 } }\n');
    await compile();
    const target = join(root, file.output);
    const cold = compiler.formatJson(await evaluateJsonnetFile(file.source, root), target);
    assert.equal(readFileSync(target, 'utf8'), cold);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an output changed on disk since its compile is rewritten even when its inputs are unchanged', () =>
  withFixture(async ({ root, compile, read }) => {
    await compile();
    writeFileSync(join(root, 'content/main.json'), '{ "value": 99 }\n');
    assert.deepEqual(reusedFlags(await compile()), [false, true]);
    assert.deepEqual(read('content/main.json'), { value: 1 });
  }));
