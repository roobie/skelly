import { siteGenerationOf } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { type BenchRecord, DEFAULT_PLAN, loadRecord, saveRecord } from '../src/bench/plan.ts';
import { markdownReport } from '../src/bench/report.ts';
import { benchGameConfig, benchRunFromUrl, benchSiteLabel, forestWorkload, nextRunHash } from '../src/bench/run.ts';
import { configFromUrl, content } from './fixtures/startupContent.ts';

describe('forest benchmark workload identity', () => {
  it('keeps forest site, seed, time and post on the second run', () => {
    const query = new URLSearchParams('site=forest&time=23:30');
    const hash = { seed: 7, post: true, plan: [0.5, 64, 0.5, 96] };
    const run = benchRunFromUrl(query, hash, { layouts: new Map(), scenarios: new Map() });
    const next = nextRunHash(hash, run.index, run.plan.length)!;
    expect(benchRunFromUrl(query, next, { layouts: new Map(), scenarios: new Map() })).toMatchObject({
      site: 'forest',
      index: 1,
      time: '23:30',
      post: true,
      seed: 7,
    });
    expect(configFromUrl(query, next)).toMatchObject({ site: 'forest', seed: 7 });
  });

  it('builds the forest config for the first run of a forest plan that names no site', () => {
    const run = benchRunFromUrl(new URLSearchParams(), { plan: [1, 64, 1, 96] }, content.registry);
    expect(run.site).toBe('forest');
    expect(benchGameConfig(run, content).site).toBe(run.site);
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

  it('retains the seeded forest workload, with camera routes inside its extent at every plan radius, in both result export formats', () => {
    const run = benchRunFromUrl(
      new URLSearchParams('site=forest'),
      { post: true },
      {
        layouts: new Map(),
        scenarios: new Map(),
      },
    );
    const config = benchGameConfig(run, content);
    const record: BenchRecord = {
      startedAt: 'first-look',
      quick: false,
      site: benchSiteLabel(config),
      time: run.time ?? '12:00',
      forest: forestWorkload(content.registry, 1, config.density),
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
    const radius = Math.max(...DEFAULT_PLAN.map(({ radiusM }) => radiusM));
    expect(distance + radius).toBeLessThan(json.forest!.extentMetres / 2);
    expect(markdownReport(json)).toContain(JSON.stringify(json.forest));
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
