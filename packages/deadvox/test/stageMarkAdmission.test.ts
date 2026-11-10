import { buildRegistry } from '@skelly/engine/content';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { stageMarkArea } from '@skelly/engine/sim';
import { makeScale } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseSources } from '../src/product/content.ts';
import { baseRegistry } from './baseRegistry.ts';

const source = 'fixture-stage-mark.json';
const fixtureId = 'fixture_stage_mark_layout';
const selected = 'fixture_exit_area';
const fixtureLayout = () => {
  const template = [...baseRegistry().layouts.values()].find((layout) => layout.practice && layout.beats?.length);
  if (!(template?.practice && template.beats?.length)) {
    throw new Error('Missing authored practice layout');
  }
  return {
    ...template,
    id: fixtureId,
    startTimeGameTimeOfDay: undefined,
    beats: template.beats.map((mark, index) => ({ ...mark, id: index === 0 ? selected : `fixture_area_${index}` })),
    practice: { ...template.practice, exitMark: selected },
  };
};
const build = (exitMark: string) => {
  const layout = fixtureLayout();
  return buildRegistry([
    ...baseSources,
    { source, data: { layouts: [{ ...layout, practice: { ...layout.practice, exitMark } }] } },
  ]);
};

it('projects the guide exit mark from its layout row without assuming a mark identity', () => {
  const { registry, issues } = build(selected);
  expect(issues).toEqual([]);
  const scale = makeScale(0.5);
  const site = new AuthoredSite(1, registry, scale, registry.layouts.get(fixtureId)!);
  expect(site.practiceExitMark).toBe(selected);
  const { area } = fixtureLayout().beats[0]!;
  expect(stageMarkArea(site.playtestMarks.beats, site.practiceExitMark!)).toEqual(
    Object.fromEntries(Object.entries(area).map(([key, value]) => [key, value / scale.blockSize])),
  );
});

it('rejects a guide exit reference to a stage mark absent from that layout', () => {
  const missing = 'fixture_missing_area';
  expect(build(missing).issues).toContainEqual({
    source,
    path: 'layouts[0].practice.exitMark',
    message: `no stage mark "${missing}"`,
  });
});
