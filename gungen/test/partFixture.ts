import type { Assembly, Domain, PartDef } from '@skelly/engine/assembly/schema.ts';
import { loadPartCatalogue } from '../src/gun/catalogue.ts';

const block = (x: number, y: number): PartDef['solids'][number] => ({
  id: 'body',
  kind: 'box',
  box: { center: [x, y, 0], half: [0.5, 0.5, 0.5] },
});

/** Catalogue mechanisms without gun content: a frame with two tab mounts, and a tab whose `pose` is placement. */
export const PART_FIXTURE_DOMAIN: Domain = {
  name: 'part-fixture',
  units: { metresPerUnit: 1, grid: 1, bevel: 0 },
  axisRules: [],
  families: {
    frame: {
      name: 'frame',
      params: { style: { values: ['plain', 'ribbed'], default: 'plain' } },
      build: () => ({
        family: 'frame',
        solids: [block(0, 0)],
        ports: [
          { id: 'front', mount: 'tab', gender: 'female', pos: [0.5, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] },
          { id: 'top', mount: 'tab', gender: 'female', pos: [0, 0.5, 0], normal: [0, 1, 0], up: [1, 0, 0] },
        ],
        axes: [],
        keepOuts: [],
      }),
    },
    tab: {
      name: 'tab',
      params: {
        size: { values: ['small', 'large'], default: 'small' },
        pose: { values: ['flat', 'raised'], default: 'flat' },
      },
      build: ({ pose }) => ({
        family: 'tab',
        solids: [block(0.5, pose === 'raised' ? 0.25 : 0)],
        ports: [{ id: 'base', mount: 'tab', gender: 'male', pos: [0, 0, 0], normal: [-1, 0, 0], up: [0, 1, 0] }],
        axes: [],
        keepOuts: [],
      }),
    },
  },
};

export const PART_FIXTURE_CONTENT = {
  placementParams: ['pose'],
  parts: [
    {
      id: 'fixture_frame',
      family: 'frame',
      match: { style: 'plain' },
      massKg: 1,
      params: { style: 'plain' },
      finish: {},
    },
    { id: 'fixture_tab', family: 'tab', match: { size: 'small' }, massKg: 0.25, params: { size: 'small' }, finish: {} },
    { id: 'fixture-large-tab', family: 'tab', match: { size: 'large' }, massKg: 0.5 },
  ],
};

export const partFixtureCatalogue = (content: unknown = PART_FIXTURE_CONTENT) =>
  loadPartCatalogue(content, PART_FIXTURE_DOMAIN);

/** The instance → item references both fixture assemblies make; the clip is a replaceable child with no item. */
export const PART_FIXTURE_ITEMS = { frame: 'fixture_frame', tab: 'fixture_tab' } as const;

/** One frame and tab item placed two ways: on the front mount lying flat, or on the top mount raised. */
export const partFixtureAssembly = (tabMount: 'front' | 'top', pose: 'flat' | 'raised'): Assembly => {
  const clipMount = tabMount === 'front' ? 'top' : 'front';
  return {
    name: `part-fixture-${tabMount}`,
    root: 'frame',
    parts: {
      frame: { family: 'frame', params: { style: 'plain' } },
      tab: { family: 'tab', params: { size: 'small', pose } },
      clip: { family: 'tab', params: { size: 'large' } },
    },
    connections: [
      { from: `frame.${tabMount}`, to: 'tab.base' },
      { from: `frame.${clipMount}`, to: 'clip.base' },
    ],
  };
};
