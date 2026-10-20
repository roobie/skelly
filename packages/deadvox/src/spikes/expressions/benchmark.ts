// biome-ignore-all lint/performance/noAwaitInLoops: sequential samples measure the binding boundary, not concurrent rule throughput
import rules from '../../../test/fixtures/mods/expression-spike.json' with { type: 'json' };
import bodyContent from '../../content/base/body.json' with { type: 'json' };
import { cel } from './cel.ts';
import {
  type Candidate,
  type Inputs,
  panelSchema,
  type Scalar,
  type Schema,
  sleepSchema,
  type ValueType,
} from './contract.ts';
import { luau } from './luau.ts';
import { small } from './small.ts';
import { starlark } from './starlark.ts';

const repetitions = 100_000;
interface Fixture {
  name: string;
  source: string;
  schema: Schema;
  result: ValueType;
  expected: Scalar;
  inputs: Inputs;
}

async function measureFixture(candidate: Candidate, fixture: Fixture) {
  const { source, schema, result, inputs, expected } = fixture;
  const firstStart = performance.now();
  const first = await candidate.load(source, schema, result);
  const firstLoadUs = (performance.now() - firstStart) * 1000;
  first.dispose?.();
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    const loaded = await candidate.load(source, schema, result);
    loaded.dispose?.();
  }
  const loadUs = ((performance.now() - start) * 1000) / 100;
  const program = await candidate.load(source, schema, result);
  for (let i = 0; i < 10_000; i++) {
    await program.evaluate(inputs);
  }
  let checksum = 0;
  const samples: number[] = [];
  for (let sample = 0; sample < 5; sample++) {
    const sampleStart = performance.now();
    for (let i = 0; i < repetitions; i++) {
      checksum += (await program.evaluate(inputs)) === expected ? 1 : 0;
    }
    samples.push(((performance.now() - sampleStart) * 1000) / repetitions);
  }
  program.dispose?.();
  if (checksum !== 5 * repetitions) {
    throw new Error('Benchmark result mismatch');
  }
  return {
    case: fixture.name,
    firstLoadUs,
    loadUs,
    evalMedianUs: [...samples].sort((a, b) => a - b)[2],
    evalSamplesUs: samples,
  };
}

export async function benchmarkWasmExpressions() {
  const tuning = bodyContent.body[0]!;
  const ceiling = tuning.healthRecoveryFatigueCeiling.awake;
  const output = [] as {
    candidate: string;
    repetitions: number;
    measurements: Awaited<ReturnType<typeof measureFixture>>[];
  }[];
  for (const [candidate, sources] of [
    [small, rules],
    [cel, rules],
    [starlark, rules.wasm.starlark],
    [luau, rules.wasm.luau],
  ] as const) {
    const fixtures: Fixture[] = [
      {
        name: 'sleep',
        source: sources.sleepHealsPredicate,
        schema: sleepSchema,
        result: 'boolean',
        expected: true,
        inputs: {
          recoveryPerGameHour: tuning.healthRecoveryPerGameHour,
          calories: tuning.healthRecoveryNeedsFloor.calories,
          hydration: tuning.healthRecoveryNeedsFloor.hydration,
          fatigue: ceiling,
          caloriesFloor: tuning.healthRecoveryNeedsFloor.calories,
          hydrationFloor: tuning.healthRecoveryNeedsFloor.hydration,
          hasCeiling: true,
          fatigueCeiling: ceiling,
        },
      },
      {
        name: 'panel',
        source: sources.panelEffect,
        schema: panelSchema,
        result: 'string',
        expected: 'open-door',
        inputs: { powered: true, authorized: true, doorOpen: false },
      },
    ];
    const measurements: Awaited<ReturnType<typeof measureFixture>>[] = [];
    for (const fixture of fixtures) {
      measurements.push(await measureFixture(candidate, fixture));
    }
    output.push({ candidate: candidate.name, repetitions, measurements });
  }
  return output;
}
