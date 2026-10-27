import { describe, expect, it } from 'vitest';
import { type BenchRecord, loadRecord, saveRecord } from '../src/bench/plan.ts';
import { markdownReport } from '../src/bench/report.ts';
import { benchGameConfig, benchRunFromUrl, benchSiteLabel, forestWorkload, nextUrl } from '../src/bench/run.ts';
import { siteGenerationOf } from '../src/core/sitePalette.ts';
import { configFromUrl, content, siteFromUrl } from './fixtures/startupContent.ts';

it('parses forest density strictly, including zero/one, without silently switching the requested site', () => {
  for (const density of ['0', '0.25', '1']) {
    expect(configFromUrl(new URLSearchParams(`site=forest&density=${density}`))).toMatchObject({
      site: 'forest',
      density: Number(density),
    });
  }
  for (const density of ['', '-1', '2', 'NaN']) {
    expect(siteFromUrl(new URLSearchParams(`site=forest&density=${density}`), 'testHouse')).toMatchObject({
      site: 'forest',
      density: null,
    });
  }
});

describe('forest benchmark workload identity', () => {
  it('keeps forest site, density, seed, time and post on the second run instead of reverting to the test house', () => {
    const run = benchRunFromUrl(
      new URLSearchParams('site=forest&density=0.75&seed=7&time=23:30&post=1&plan=0.5:64,0.5:96'),
      { layouts: new Map(), scenarios: new Map() },
    );
    const next = new URLSearchParams(nextUrl(run, 7));
    expect(benchRunFromUrl(next, { layouts: new Map(), scenarios: new Map() })).toMatchObject({
      site: 'forest',
      density: 0.75,
      index: 1,
      time: '23:30',
      post: true,
    });
    expect(next.get('seed')).toBe('7');
    expect(configFromUrl(next)).toMatchObject({ site: 'forest', density: 0.75, seed: 7 });
    expect(benchSiteLabel(run)).toBe('forest, density 0.75');
    const field = benchRunFromUrl(new URLSearchParams('site=forest&plan=0.5:64,0.5:96'), {
      layouts: new Map(),
      scenarios: new Map(),
    });
    const nextField = new URLSearchParams(nextUrl(field, 1));
    expect(nextField.has('density')).toBe(false);
    expect(benchRunFromUrl(nextField, { layouts: new Map(), scenarios: new Map() })).toMatchObject({
      site: 'forest',
      density: null,
      index: 1,
    });
  });

  it('builds the forest config for the first run of a forest plan that names no site', () => {
    const params = new URLSearchParams('plan=1:64,1:96');
    const run = benchRunFromUrl(params, content.registry);
    expect(run.site).toBe('forest');
    expect(benchGameConfig(run, params, content)).toMatchObject({
      site: run.site,
      storeys: run.storeys,
      density: run.density,
    });
  });

  it('refuses a stored record of an unknown shape instead of resuming it', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => JSON.stringify({ runs: 'old', startedAt: 3 }), setItem: () => undefined },
    });
    try {
      expect(loadRecord()).toBeUndefined();
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, 'localStorage', previous);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });

  it('retains the seeded field, shape mix, extent, opacity and full camera routes in both result export formats', () => {
    const run = benchRunFromUrl(new URLSearchParams('site=forest&post=1'), {
      layouts: new Map(),
      scenarios: new Map(),
    });
    const record: BenchRecord = {
      startedAt: 'first-look',
      quick: false,
      site: benchSiteLabel(run),
      time: run.time ?? '12:00',
      forest: forestWorkload(content.registry, 1, run.density),
      runs: [],
    };
    const json = JSON.parse(JSON.stringify(record)) as BenchRecord;
    const { vegetation } = siteGenerationOf(content.registry);
    expect(json.forest).toMatchObject({
      seed: 1,
      density: null,
      densityField: vegetation.forestDensityField,
      extentMetres: 2 * vegetation.forestHalfExtentMetres,
      cellMetres: vegetation.treeCellMetres,
      foliage: 'passable-opaque',
      shapeMix: vegetation.treeMix,
    });
    const route = json.forest!.routes;
    const distance = route.jogSeconds * route.jogMetresPerSecond + route.sprintSeconds * route.sprintMetresPerSecond;
    expect(distance + 96).toBeLessThan(json.forest!.extentMetres / 2);
    expect(markdownReport(json)).toContain('Forest workload:');
    expect(markdownReport(json)).toContain('"density":null');
    // Production save/load between pages must preserve exactly the JSON export's workload.
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    let stored = '';
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => stored || null,
        setItem: (_key: string, value: string) => {
          stored = value;
        },
      },
    });
    try {
      expect(saveRecord(record)).toBe(true);
      expect(loadRecord()).toEqual(json);
    } finally {
      if (previous) {
        Object.defineProperty(globalThis, 'localStorage', previous);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });
});
