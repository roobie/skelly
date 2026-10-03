import { describe, expect, it } from 'vitest';
import { type BenchRecord, loadRecord, saveRecord } from '../src/bench/plan.ts';
import { markdownReport } from '../src/bench/report.ts';
import { benchRunFromUrl, benchSiteLabel, forestWorkload, nextUrl } from '../src/bench/run.ts';
import { configFromUrl, siteFromUrl } from '../src/game/config.ts';

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
    );
    const next = new URLSearchParams(nextUrl(run, 7));
    expect(benchRunFromUrl(next)).toMatchObject({ site: 'forest', density: 0.75, index: 1, time: '23:30', post: true });
    expect(next.get('seed')).toBe('7');
    expect(configFromUrl(next)).toMatchObject({ site: 'forest', density: 0.75, seed: 7 });
    expect(benchSiteLabel(run)).toBe('forest, density 0.75');
    const field = benchRunFromUrl(new URLSearchParams('site=forest&plan=0.5:64,0.5:96'));
    const nextField = new URLSearchParams(nextUrl(field, 1));
    expect(nextField.has('density')).toBe(false);
    expect(benchRunFromUrl(nextField)).toMatchObject({ site: 'forest', density: null, index: 1 });
  });

  it('retains the seeded field, shape mix, extent, opacity and full camera routes in both result export formats', () => {
    const run = benchRunFromUrl(new URLSearchParams('site=forest&post=1'));
    const record: BenchRecord = {
      startedAt: 'first-look',
      quick: false,
      site: benchSiteLabel(run),
      forest: forestWorkload(1, run.density),
      runs: [],
    };
    const json = JSON.parse(JSON.stringify(record)) as BenchRecord;
    expect(json.forest).toMatchObject({
      seed: 1,
      density: null,
      densityField: { wavelengthMetres: 128, seedSalt: 137, floor: 0.2, gain: 1, ceiling: 0.75 },
      extentMetres: 768,
      cellMetres: 8,
      foliage: 'passable-opaque',
      shapeMix: ['broadleaf', 'broadleaf', 'conifer', 'young'],
      routes: { heading: [-0.9, 0.44], lookSeconds: 12, jogSeconds: 15, sprintSeconds: 15 },
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
