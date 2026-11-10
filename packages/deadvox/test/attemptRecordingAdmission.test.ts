import { parse } from 'valibot';
import { expect, it } from 'vitest';
import { SiteLayoutSchema } from '../src/core/schema/layouts.ts';
import { ScenarioSchema } from '../src/core/schema/scenarios.ts';
import { buildRegistry } from '../src/engine/content.ts';
import { makeAttemptLayout, makeAttemptPolicy } from './fixtures/attemptPolicy.ts';
import { fixtureScenario } from './fixtures/scenario.ts';

it('admits independent layout and scenario rows with their own complete recording policies', () => {
  const layout = makeAttemptLayout();
  const scenario = { ...fixtureScenario(), attemptPolicy: makeAttemptPolicy({ exportFormat: 'attempt' }) };
  expect(parse(SiteLayoutSchema, layout).attemptPolicy).toEqual(layout.attemptPolicy);
  expect(parse(ScenarioSchema, scenario).attemptPolicy).toEqual(scenario.attemptPolicy);
});

it('rejects an attempt report on a layout because that row cannot supply scenario run state', () => {
  const layout = makeAttemptLayout({ attemptPolicy: makeAttemptPolicy({ exportFormat: 'attempt' }) });
  const { issues } = buildRegistry([{ source: 'fixture-recording.json', data: { layouts: [layout] } }]);
  expect(issues).toContainEqual({
    source: 'fixture-recording.json',
    path: 'layouts[0].attemptPolicy.exportFormat',
    message: 'attempt reports require scenario run state',
  });
});
