import type { StartDef } from '@skelly/engine/internal/core/schema/starts.ts';
import { gameTimeOfDay } from '@skelly/engine/internal/core/time.ts';
import { bundledModIdsFromUrl, type StartupContent, selectBundledMods, startModFromUrl } from '@skelly/engine/packs';
import { requireStart } from '@skelly/engine/session';
import { siteGenerationOf } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { type BenchRecord, DEFAULT_PLAN, loadRecord, saveRecord } from '../src/bench/plan.ts';
import { markdownReport } from '../src/bench/report.ts';
import {
  BENCH_WORKLOADS,
  benchGameConfig,
  benchHref,
  benchRunFromUrl,
  benchSiteLabel,
  benchStartConfig,
  forestWorkload,
  nextRunHash,
  timeOfDayText,
} from '../src/bench/run.ts';
import { readPageUrl } from '../src/pageUrl.ts';
import { productModIntake } from '../src/product/mods.ts';
import { configFromUrl, content } from './fixtures/startupContent.ts';

const FOREST_START: StartDef = {
  id: 'fixture_bench_forest_start',
  site: 'forest',
  seed: 31,
  storeys: 2,
  density: 0.25,
  startTimeGameTimeOfDay: gameTimeOfDay(23.5 * 3600),
  kit: [],
  wounds: [],
  skills: {},
  recipes: [],
};

/** Content as a `start-mod` link that supplies `start` admits it. */
const startedAt = (start: StartDef): StartupContent => ({
  ...content,
  startModStart: start.id,
  registry: { ...content.registry, starts: new Map([...content.registry.starts, [start.id, start]]) },
});

describe('forest benchmark workload identity', () => {
  it('builds every run of a plan at the start mod row, with the seed and post from the hash', () => {
    const started = startedAt(FOREST_START);
    const hash = { seed: 7, post: true, plan: [0.5, 64, 1, 96] };
    const run = benchRunFromUrl(hash);
    const next = benchRunFromUrl(nextRunHash(hash, run.index, run.plan.length)!);
    expect(next).toMatchObject({ index: 1, post: true, seed: 7 });
    for (const each of [run, next]) {
      expect(benchGameConfig(each, started)).toMatchObject({
        startId: FOREST_START.id,
        site: FOREST_START.site,
        storeys: FOREST_START.storeys,
        density: FOREST_START.density,
        start: FOREST_START.startTimeGameTimeOfDay,
        seed: 7,
      });
    }
    expect(benchGameConfig(next, started).scale.blockSize).toBe(1);
    expect(timeOfDayText(benchGameConfig(run, started).start)).toBe('23:30');
  });

  it('builds a link without a start mod at the product default start, as the game does', () => {
    const product = requireStart(content, content.defaultStart);
    const config = benchStartConfig(content, 1, 64);
    const played = configFromUrl(new URLSearchParams(), { seed: 1 });
    expect(config).toMatchObject({ startId: product.id, site: played.site, start: played.start });
    expect(config).toMatchObject({ storeys: played.storeys, density: played.density });
  });

  // Registry builds are bounded CPU work whose duration scales with machine load, so a timer only turns a busy
  // machine into a failure.
  it.each(Object.keys(BENCH_WORKLOADS) as (keyof typeof BENCH_WORKLOADS)[])(
    'runs the %s benchmark link on its own workload',
    { timeout: 0 },
    (name) => {
      const read = readPageUrl(benchHref(content, name), '');
      expect(read.refused).toBeUndefined();
      expect(read.query.get('bench')).toBe(BENCH_WORKLOADS[name].bench);
      const selection = selectBundledMods(
        productModIntake,
        bundledModIdsFromUrl(read.query),
        [],
        startModFromUrl(read.query),
      );
      expect(selection.issues).toEqual([]);
      const config = benchStartConfig(selection.content, 1, 64);
      expect({ site: config.site, time: timeOfDayText(config.start) }).toEqual({
        site: BENCH_WORKLOADS[name].site,
        time: BENCH_WORKLOADS[name].startTimeGameTimeOfDay,
      });
    },
  );

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
    const run = benchRunFromUrl({ post: true });
    const config = benchGameConfig(run, startedAt({ ...FOREST_START, density: null }));
    const record: BenchRecord = {
      startedAt: 'first-look',
      quick: false,
      site: benchSiteLabel(config),
      time: timeOfDayText(config.start),
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
