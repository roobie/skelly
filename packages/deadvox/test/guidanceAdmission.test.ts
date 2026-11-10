import { expect, it } from 'vitest';
import { buildRegistry } from '../../engine/src/content.ts';
import { baseRegistry } from './baseRegistry.ts';

it('rejects dangling guidance fact gates instead of silently blocking a step', () => {
  const template = [...baseRegistry().layouts.values()].find((layout) => layout.guidance)!;
  const guidance = structuredClone(template.guidance!);
  guidance.steps[0]!.complete.all.push('fixture_missing_fact');
  const source = 'fixture-guidance-gate.json';
  const { issues } = buildRegistry([
    {
      source,
      data: { layouts: [{ ...template, id: 'fixture_guidance', startTimeGameTimeOfDay: undefined, guidance }] },
    },
  ]);
  expect(issues).toContainEqual({
    source,
    path: 'layouts[0].guidance',
    message:
      'guidance requires unique identities, resolving references, an unconditional terminal and final hint cases',
  });
});

it('rejects unresolved guidance item and action references at content admission', () => {
  const template = [...baseRegistry().layouts.values()].find((layout) => layout.guidance)!;
  const guidance = structuredClone(template.guidance!);
  guidance.rules.push({
    id: 'fixture_consumption',
    when: { kind: 'consumed', item: 'fixture_missing_food' },
    at: [],
    enabled: { all: [], none: [] },
  });
  guidance.steps[0]!.topics.push('fixture.missing-action');
  const source = 'fixture-guidance.json';
  const result = buildRegistry([
    {
      source,
      data: {
        layouts: [
          {
            ...template,
            id: 'fixture_guidance',
            startTimeGameTimeOfDay: undefined,
            buildings: [],
            shamblers: [],
            tracks: [],
            guidance,
          },
        ],
      },
    },
  ]);
  expect(result.issues).toContainEqual({
    source,
    path: `layouts[0].guidance.rules[${guidance.rules.length - 1}].when.item`,
    message: 'no item "fixture_missing_food"',
  });
  expect(result.issues).toContainEqual({
    source,
    path: `layouts[0].guidance.steps[0].topics[${guidance.steps[0]!.topics.length - 1}]`,
    message: 'no input action "fixture.missing-action"',
  });
});
