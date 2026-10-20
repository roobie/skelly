import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { cel } from '../src/spikes/expressions/cel.ts';
import { compileModExpression, ModHarness, modProfile, modVariables } from '../src/spikes/expressions/celMods.ts';
import { panelSchema, sleepSchema } from '../src/spikes/expressions/contract.ts';
import { small } from '../src/spikes/expressions/small.ts';

const rules = JSON.parse(readFileSync(new URL('../test/fixtures/mods/expression-spike.json', import.meta.url), 'utf8'));
const [tuning] = JSON.parse(readFileSync(new URL('../src/content/base/body.json', import.meta.url), 'utf8')).body;
const ceiling = tuning.healthRecoveryFatigueCeiling.awake;
const cases = [
  {
    name: 'sleep',
    source: rules.sleepHealsPredicate,
    schema: sleepSchema,
    result: 'boolean',
    inputs: {
      recoveryPerGameHour: tuning.healthRecoveryPerGameHour,
      calories: tuning.healthRecoveryNeedsFloor.calories,
      hydration: tuning.healthRecoveryNeedsFloor.hydration,
      fatigue: ceiling ?? 0,
      caloriesFloor: tuning.healthRecoveryNeedsFloor.calories,
      hydrationFloor: tuning.healthRecoveryNeedsFloor.hydration,
      hasCeiling: ceiling !== undefined,
      fatigueCeiling: ceiling ?? 0,
    },
  },
  {
    name: 'panel',
    source: rules.panelEffect,
    schema: panelSchema,
    result: 'string',
    inputs: { powered: true, authorized: true, doorOpen: false },
  },
];
const repetitions = 100_000;
const median = (samples) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
const candidates = [small, cel];
async function measureBundles() {
  const entries = process.argv.includes('--mods') ? ['cel', 'celMods'] : ['small', 'cel', 'starlark', 'luau'];
  const bundles = await Promise.all(
    entries.map((entry) =>
      build({
        configFile: false,
        logLevel: 'silent',
        build: {
          write: false,
          minify: true,
          target: 'esnext',
          assetsInlineLimit: 0,
          rollupOptions: {
            input: fileURLToPath(new URL(`../src/spikes/expressions/${entry}.ts`, import.meta.url)),
            preserveEntrySignatures: 'strict',
            output: { format: 'es' },
          },
        },
      }),
    ),
  );
  return bundles.map((bundle, index) => {
    const output = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((item) => item.output);
    const files = output.map((item) => {
      const data = item.type === 'chunk' ? item.code : item.source;
      return { file: item.fileName, bytes: Buffer.byteLength(data), gzipBytes: gzipSync(data).length };
    });
    return {
      candidate: entries[index],
      files,
      minifiedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      gzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
    };
  });
}

function measureModRules() {
  const mods = JSON.parse(readFileSync(new URL('../test/fixtures/mods/cel-mod-spike.json', import.meta.url), 'utf8'));
  if (process.argv.includes('--reuse')) {
    mods.push(
      ...JSON.parse(readFileSync(new URL('../test/fixtures/mods/cel-reuse-spike.json', import.meta.url), 'utf8')),
    );
  }
  const harness = new ModHarness(mods);
  const states = new Set(harness.declarations.keys());
  const input = {
    intellect: 12,
    level: 3,
    flags: ['focused'],
    target: new Map([['distance', 2]]),
    state: new Map([...states].map((key) => [key, harness.state(key)])),
    roll: 0.5,
  };
  const measurements = [];
  for (const [id, rule] of harness.rules) {
    const load = () => [
      compileModExpression(rule.def.when, {
        schema: modVariables,
        result: 'bool',
        functions: harness.functionScope(rule.mod),
        states,
      }),
      compileModExpression(rule.def.effects, {
        schema: modVariables,
        result: 'list<Effect>',
        functions: harness.functionScope(rule.mod),
        states,
      }),
    ];
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      load();
    }
    const loadUs = ((performance.now() - start) * 1000) / 100;
    const [when, effects] = load();
    const evaluate = () => [when.run(input), effects.run(input)];
    for (let i = 0; i < 10_000; i++) {
      evaluate();
    }
    const expected = JSON.stringify(evaluate());
    const samples = [];
    for (let sample = 0; sample < 5; sample++) {
      const begin = performance.now();
      for (let i = 0; i < repetitions; i++) {
        evaluate();
      }
      samples.push(((performance.now() - begin) * 1000) / repetitions);
    }
    if (JSON.stringify(evaluate()) !== expected) {
      throw new Error('Mod benchmark result mismatch');
    }
    measurements.push({
      rule: id,
      loadUs,
      evalMedianUs: median(samples),
      evalSamplesUs: samples,
      reservedCost: when.cost + effects.cost,
    });
  }
  console.log(JSON.stringify({ candidate: modProfile, node: process.version, repetitions, measurements }));
}

if (process.argv.includes('--bundles')) {
  console.log(JSON.stringify(await measureBundles()));
} else if (process.argv.includes('--mods')) {
  measureModRules();
} else {
  const bundles = await Promise.all(
    candidates.map((candidate) =>
      build({
        configFile: false,
        logLevel: 'silent',
        build: {
          write: false,
          minify: true,
          target: 'es2023',
          lib: {
            entry: fileURLToPath(
              new URL(`../src/spikes/expressions/${candidate === small ? 'small' : 'cel'}.ts`, import.meta.url),
            ),
            formats: ['es'],
          },
        },
      }),
    ),
  );
  for (const [index, candidate] of candidates.entries()) {
    const bundle = bundles[index];
    const output = Array.isArray(bundle) ? bundle : [bundle];
    const code = output
      .flatMap((item) => item.output)
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');
    const measurements = [];
    for (const { name, source, schema, result, inputs } of cases) {
      const loadStart = performance.now();
      for (let i = 0; i < 100; i++) {
        candidate.load(source, schema, result);
      }
      const loadUs = ((performance.now() - loadStart) * 1000) / 100;
      const program = candidate.load(source, schema, result);
      for (let i = 0; i < 10_000; i++) {
        program.evaluate(inputs);
      }
      const samples = [];
      let checksum = 0;
      for (let sample = 0; sample < 5; sample++) {
        const start = performance.now();
        for (let i = 0; i < repetitions; i++) {
          checksum += program.evaluate(inputs) === (name === 'sleep' ? true : 'open-door') ? 1 : 0;
        }
        samples.push(((performance.now() - start) * 1000) / repetitions);
      }
      if (checksum !== 5 * repetitions) {
        throw new Error('Benchmark result mismatch');
      }
      measurements.push({ case: name, loadUs, evalMedianUs: median(samples), evalSamplesUs: samples });
    }
    console.log(
      JSON.stringify({
        candidate: candidate.name,
        node: process.version,
        repetitions,
        minifiedBytes: Buffer.byteLength(code),
        gzipBytes: gzipSync(code).length,
        measurements,
      }),
    );
  }
}
