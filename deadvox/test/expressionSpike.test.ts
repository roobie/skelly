import { createHash } from 'node:crypto';
import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import bodyContent from '../src/content/base/body.json' with { type: 'json' };
import { Body } from '../src/core/body.ts';
import { needsAllowRecovery, type RecoveryState } from '../src/core/needs.ts';
import { ContentFileSchema } from '../src/core/schema.ts';
import { cel } from '../src/spikes/expressions/cel.ts';
import {
  applyPanelEffect,
  checkedInputs,
  loadContentRule,
  panelSchema,
  serializeIdentity,
  sleepSchema,
} from '../src/spikes/expressions/contract.ts';
import { small } from '../src/spikes/expressions/small.ts';
import rules from './fixtures/mods/expression-spike.json' with { type: 'json' };

const tuning = parse(ContentFileSchema, bodyContent).body![0]!;
const body = new Body(tuning);
const floor = body.healthRecoveryNeedsFloor;
const awakeCeiling = body.healthRecoveryFatigueCeiling('awake');
const states: RecoveryState[] = ['awake', 'asleep'];

for (const candidate of [small, cel]) {
  describe(candidate.name, () => {
    it('matches the engine recovery gate below, at and above each content-derived boundary in both states', () => {
      const program = candidate.load(rules.sleepHealsPredicate, sleepSchema, 'boolean');
      const held = { calories: floor.calories, hydration: floor.hydration, fatigue: awakeCeiling };
      const rows = [
        held,
        { ...held, calories: floor.calories - 1 },
        { ...held, calories: floor.calories + 1 },
        { ...held, hydration: floor.hydration - 1 },
        { ...held, hydration: floor.hydration + 1 },
        { ...held, fatigue: awakeCeiling - 1 },
        { ...held, fatigue: awakeCeiling + 1 },
      ];
      const results = new Set();
      for (const state of states) {
        const ceiling = body.healthRecoveryFatigueCeiling(state);
        for (const row of rows) {
          const expected = needsAllowRecovery({ ...body.spawnNeeds, ...row }, body, state);
          results.add(expected);
          expect(
            program.evaluate({
              ...row,
              recoveryPerGameHour: body.healthRecoveryPerGameHour,
              caloriesFloor: floor.calories,
              hydrationFloor: floor.hydration,
              hasCeiling: Number.isFinite(ceiling),
              fatigueCeiling: Number.isFinite(ceiling) ? ceiling : 0,
            }),
          ).toBe(expected);
        }
      }
      expect(results).toEqual(new Set([false, true]));
    });

    it('describes panel effects without mutation and applies them only to an engine-bound door', () => {
      const program = candidate.load(rules.panelEffect, panelSchema, 'string');
      for (const [powered, authorized, doorOpen] of [
        [true, true, false],
        [false, true, false],
        [true, false, false],
        [true, true, true],
      ]) {
        const input = Object.freeze({ powered: powered!, authorized: authorized!, doorOpen: doorOpen! });
        const doors = new Map([
          ['fixture-door', doorOpen!],
          ['unrelated-door', false],
        ]);
        const effect = program.evaluate(input);
        expect(effect).toBe(powered && authorized && !doorOpen ? 'open-door' : 'none');
        const next = applyPanelEffect(effect, 'fixture-door', doors);
        expect(next.get('fixture-door')).toBe(doorOpen || (powered && authorized));
        expect(next.get('unrelated-door')).toBe(false);
        expect(doors.get('fixture-door')).toBe(doorOpen);
      }
      expect(() => applyPanelEffect('delete-world', 'fixture-door', new Map([['fixture-door', false]]))).toThrow(
        'Unsupported panel effect',
      );
      expect(() => applyPanelEffect('open-door', 'missing', new Map())).toThrow('Unknown bound door');
    });

    it('replays both rules after canonical serialization with stable identity and no host access', () => {
      const cases = [
        {
          source: rules.sleepHealsPredicate,
          schema: sleepSchema,
          result: 'boolean' as const,
          inputs: {
            recoveryPerGameHour: body.healthRecoveryPerGameHour,
            calories: floor.calories,
            hydration: floor.hydration,
            fatigue: awakeCeiling,
            caloriesFloor: floor.calories,
            hydrationFloor: floor.hydration,
            hasCeiling: true,
            fatigueCeiling: awakeCeiling,
          },
        },
        {
          source: rules.panelEffect,
          schema: panelSchema,
          result: 'string' as const,
          inputs: { powered: true, authorized: true, doorOpen: false },
        },
      ];
      for (const { source, schema, result, inputs } of cases) {
        const program = candidate.load(source, schema, result);
        const identity = serializeIdentity(candidate, program, schema, result);
        const restored = candidate.load(JSON.parse(identity).source, schema, result);
        const hash = (text: string) => createHash('sha256').update(text).digest('hex');
        expect(
          hash(serializeIdentity(candidate, restored, Object.fromEntries(Object.entries(schema).reverse()), result)),
        ).toBe(hash(identity));
        for (let i = 0; i < 3; i++) {
          expect(restored.evaluate(inputs)).toBe(program.evaluate(inputs));
        }
      }
      expect(() => candidate.load('Date.now() > 0.0', {}, 'boolean')).toThrow();
      expect(() => candidate.load('powered.constructor', panelSchema, 'boolean')).toThrow();
    });

    it('reports undeclared fields and operand type errors as named load issues before evaluation', async () => {
      await Promise.all(
        [
          ['calories >= missingFloor', 'missingFloor'],
          ['calories && hasCeiling', 'bool'],
        ].map(async ([expression, detail]) => {
          const loaded = await loadContentRule(
            candidate,
            { source: 'fixture.json', path: '.sleepHealsPredicate', expression: expression! },
            sleepSchema,
            'boolean',
          );
          expect(loaded.program).toBeUndefined();
          expect(loaded.issues).toEqual([
            { source: 'fixture.json', path: '.sleepHealsPredicate', message: expect.stringContaining(detail!) },
          ]);
        }),
      );
      const loaded = await loadContentRule(
        candidate,
        { source: 'fixture.json', path: '.sleepHealsPredicate', expression: rules.sleepHealsPredicate },
        sleepSchema,
        'boolean',
      );
      expect(loaded.issues).toEqual([]);
      expect(loaded.program).toBeDefined();
    });
  });
}

it('copies only declared scalar data and rejects getters and non-finite numeric inputs', () => {
  let accessed = false;
  expect(() =>
    checkedInputs(
      {
        get powered() {
          accessed = true;
          return true;
        },
      },
      { powered: 'boolean' },
    ),
  ).toThrow('Invalid expression input');
  expect(accessed).toBe(false);
  expect(() => checkedInputs({ fatigue: Number.POSITIVE_INFINITY }, { fatigue: 'number' })).toThrow(
    'Invalid expression input',
  );
  expect(checkedInputs({ powered: true, extra: 'ignored' }, { powered: 'boolean' })).toEqual({ powered: true });
});
