// biome-ignore-all lint/performance/noAwaitInLoops: sequential calls are required to expose retained-state defects
import { parse } from 'valibot';
import bodyContent from '../src/content/base/body.json' with { type: 'json' };
import { Body } from '../src/core/body.ts';
import { needsAllowRecovery } from '../src/core/needs.ts';
import { ContentFileSchema } from '../src/core/schema.ts';
import {
  applyPanelEffect,
  type Candidate,
  loadContentRule,
  panelSchema,
  serializeIdentity,
  sleepSchema,
} from '../src/spikes/expressions/contract.ts';
import rules from './fixtures/mods/expression-spike.json' with { type: 'json' };

const body = new Body(parse(ContentFileSchema, bodyContent).body![0]!);
function check(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}
export function wasmCases(candidate: Candidate, language: keyof typeof rules.wasm) {
  const source = rules.wasm[language];
  return [
    {
      name: 'matches recovery on either side of content boundaries in awake and asleep states',
      async run() {
        const program = await candidate.load(source.sleepHealsPredicate, sleepSchema, 'boolean');
        const results = new Set();
        try {
          const floor = body.healthRecoveryNeedsFloor;
          const ceiling = body.healthRecoveryFatigueCeiling('awake');
          const held = { calories: floor.calories, hydration: floor.hydration, fatigue: ceiling };
          const rows = [held];
          for (const key of ['calories', 'hydration', 'fatigue'] as const) {
            for (const delta of [-1, 1]) {
              rows.push({ ...held, [key]: held[key] + delta });
            }
          }
          for (const state of ['awake', 'asleep'] as const) {
            const limit = body.healthRecoveryFatigueCeiling(state);
            for (const row of rows) {
              const expected = needsAllowRecovery({ ...body.spawnNeeds, ...row }, body, state);
              results.add(expected);
              const value = await program.evaluate({
                ...row,
                recoveryPerGameHour: body.healthRecoveryPerGameHour,
                caloriesFloor: floor.calories,
                hydrationFloor: floor.hydration,
                hasCeiling: Number.isFinite(limit),
                fatigueCeiling: Number.isFinite(limit) ? limit : 0,
              });
              check(value === expected, 'recovery differs from engine');
            }
          }
          check(results.size === 2, 'recovery comparison must exercise both results');
        } finally {
          program.dispose?.();
        }
      },
    },
    {
      name: 'returns panel descriptions without changing the engine-owned door map',
      async run() {
        const program = await candidate.load(source.panelEffect, panelSchema, 'string');
        try {
          for (const [powered, authorized, doorOpen] of [
            [true, true, false],
            [false, true, false],
            [true, false, false],
            [true, true, true],
          ]) {
            const input = Object.freeze({ powered: powered!, authorized: authorized!, doorOpen: doorOpen! });
            const effect = await program.evaluate(input);
            check(effect === (powered && authorized && !doorOpen ? 'open-door' : 'none'), 'wrong panel effect');
            const doors = new Map([
              ['bound', doorOpen!],
              ['other', false],
            ]);
            const next = applyPanelEffect(effect, 'bound', doors);
            check(next.get('bound') === (doorOpen || (powered && authorized)), 'wrong bound door');
            check(next.get('other') === false && doors.get('bound') === doorOpen, 'mutated unrelated or input door');
          }
        } finally {
          program.dispose?.();
        }
      },
    },
    ...(['runaway', 'stateful', 'undeclared'] as const).map((kind) => ({
      name: `rejects ${kind} source at load through ContentIssue`,
      async run() {
        const loaded = await loadContentRule(
          candidate,
          { source: 'fixture', path: `.${kind}`, expression: source[kind] },
          sleepSchema,
          'boolean',
        );
        check(loaded.program === undefined && loaded.issues.length === 1, `${kind} was not rejected`);
        check(loaded.issues[0]!.source === 'fixture' && loaded.issues[0]!.path === `.${kind}`, 'lost content location');
        return loaded.issues[0]!.message;
      },
    })),
    {
      name: 'denies host names, traversal, calls and string repetition before entering wasm',
      async run() {
        for (const expression of [
          'load("remote")',
          'print("hello")',
          'math.random()',
          'os.clock()',
          'powered.constructor',
          '(powered)()',
          '"x" * 999999999',
        ]) {
          const loaded = await loadContentRule(
            candidate,
            { source: 'fixture', path: '.capability', expression },
            panelSchema,
            'boolean',
          );
          check(loaded.program === undefined && loaded.issues.length === 1, `accepted capability: ${expression}`);
        }
      },
    },
    {
      name: 'reports wrong operands at evaluation when the binding has no static analyzer',
      async run() {
        const loaded = await loadContentRule(
          candidate,
          { source: 'fixture', path: '.wrongOperand', expression: source.wrongOperand },
          sleepSchema,
          'boolean',
        );
        check(loaded.issues.length === 0 && loaded.program !== undefined, 'operand checking unexpectedly ran at load');
        const program = loaded.program!;
        try {
          await program.evaluate({
            recoveryPerGameHour: 1,
            calories: 1,
            hydration: 1,
            fatigue: 1,
            caloriesFloor: 1,
            hydrationFloor: 1,
            hasCeiling: true,
            fatigueCeiling: 1,
          });
        } catch (error) {
          return { phase: 'evaluation', message: String(error) };
        } finally {
          program.dispose?.();
        }
        throw new Error('wrong operand was silently accepted');
      },
    },
    {
      name: 'replays float results bit-for-bit after identity reload without retained call state',
      async run() {
        const schema = { numerator: 'number', denominator: 'number' } as const;
        const program = await candidate.load(source.float, schema, 'number');
        const identity = serializeIdentity(candidate, program, schema, 'number');
        const restored = await candidate.load(JSON.parse(identity).source, schema, 'number');
        try {
          check(
            serializeIdentity(candidate, restored, { denominator: 'number', numerator: 'number' }, 'number') ===
              identity,
            'identity depends on schema order',
          );
          const bits: string[] = [];
          for (const numerator of [1, 3, 1]) {
            const input = Object.freeze({ numerator, denominator: 10 });
            const value = await program.evaluate(input);
            check(Object.is(value, await restored.evaluate(input)), 'reload changed float');
            const bytes = new DataView(new ArrayBuffer(8));
            bytes.setFloat64(0, value as number);
            bits.push(bytes.getBigUint64(0).toString(16));
          }
          check(bits[0] === bits[2] && bits[0] !== bits[1], 'call history changed float or input was ignored');
          return { identity, bits };
        } finally {
          program.dispose?.();
          restored.dispose?.();
        }
      },
    },
  ];
}
