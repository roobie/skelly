import { tutorialUrl } from '@skelly/presentation/tutorialUrl';
import { describe, expect, it } from 'vitest';
import perfBaseline from '../src/config/perf-baseline.json' with { type: 'json' };
import { type HashState, readHash, writeHash } from '../src/hashState.ts';
import { readPageUrl } from '../src/pageUrl.ts';
import { newWorldHref, replayHref, tutorialHash } from '../src/product/page.ts';
import { gameUrl, inlineStartMod } from './browser/gameUrl.mjs';
import { configFromUrl } from './fixtures/startupContent.ts';

describe('page hash', () => {
  it('reads back what it writes, through the address bar encoding', () => {
    const hash: HashState = { debug: true, seed: -7, cam: [1.5, 2, -3, 90, 0, 0], tone: 'aces', mannequinWear: [] };
    const written = writeHash(hash);
    expect(readHash(encodeURI(`#${written}`))).toEqual({ hash });
    expect(readHash(`#${written}`)).toEqual({ hash });
  });

  it('writes keys in one order whatever order they were set in', () => {
    expect(writeHash({ seed: 1, debug: true })).toBe(writeHash({ debug: true, seed: 1 }));
  });

  it.each(['a b,c', 'a"b', 'a\\b', 'a\nb', '100%', '%41'])(
    'reads back the string %j through a real address bar',
    (focus) => {
      const hash: HashState = { focus };
      const url = new URL('https://example.test/');
      url.hash = writeHash(hash);
      expect(readHash(url.hash)).toEqual({ hash });
      expect(readHash(writeHash(hash))).toEqual({ hash });
    },
  );

  it('refuses an unknown key, a wrong value type and a repeated key by name', () => {
    expect(readHash('#{fixtureUnknown:1}')).toEqual({ refused: 'fixtureUnknown' });
    expect(readHash('#{seed:yes}')).toEqual({ refused: 'seed' });
    expect(readHash('#{debug:true,debug:false}')).toEqual({ refused: 'debug' });
    expect(readHash('#{cam:[1,[2]]}')).toEqual({ refused: 'cam' });
  });
});

describe('page query', () => {
  it('names a query parameter the game entry does not take', () => {
    expect(readPageUrl('?mods=fixture&fixtureUnknown=1', '').refused).toBe('fixtureUnknown');
    expect(readPageUrl('?mods=fixture', '').refused).toBeUndefined();
  });

  it('starts every configured performance-baseline route', () => {
    expect(perfBaseline.routes.length).toBeGreaterThan(0);
    for (const route of perfBaseline.routes) {
      const { id, start, hash } = route;
      const startMod = inlineStartMod(`fixture.perf-baseline.${id}`, start);
      const harness = 'harness' in route ? route.harness : {};
      const url = new URL(gameUrl('https://example.test/', { startMod, harness, hash: hash as HashState }));
      expect(readPageUrl(url.search, url.hash).refused, id).toBeUndefined();
    }
  });

  it('refuses a bench run setting left in the query, as it does on the game page', () => {
    expect(readPageUrl('?bench=1&plan=0.5:64', '').refused).toBe('plan');
    expect(readPageUrl('?bench=1', '#{plan:[0.5,64]}').refused).toBeUndefined();
  });

  it('hands the hash seed to the game configuration', () => {
    const { query, hash } = readPageUrl('', `#${writeHash({ seed: 4321 })}`);
    expect(configFromUrl(query, hash).seed).toBe(4321);
  });
});

describe('page links', () => {
  it('starts a new world with the hash seed, keeping the query and the rest of the hash', () => {
    const page = gameUrl('https://example.org/', {
      startMod: 'fixture.start',
      mods: ['fixture'],
      hash: { debug: true },
    });
    const next = new URL(newWorldHref(page, { debug: true }, 4));
    expect(next.search).toBe(new URL(page).search);
    expect(readHash(next.hash)).toEqual({ hash: { debug: true, seed: 4 } });
  });

  it('carries only the view radius and actor models into and out of practice', () => {
    expect(readHash(tutorialHash({ debug: true, seed: 3, radius: 64, actors: 'boxes' }))).toEqual({
      hash: { radius: 64, actors: 'boxes' },
    });
  });

  it('builds only links the game reads back without refusing them', () => {
    const page =
      'https://example.org/deadvox/?mods=fixture&start-mod=fixture.start&render=0#{debug:true,seed:3,radius:64,cam:[1,2,3,0,0,0]}';
    const { hash } = readPageUrl(new URL(page).search, new URL(page).hash);
    const enterPractice = tutorialUrl(page, 'fixture.practice', true, tutorialHash(hash));
    const links = {
      newWorld: newWorldHref(page, hash, 4),
      replay: replayHref(page, hash),
      enterPractice,
      leavePractice: tutorialUrl(enterPractice, 'fixture.practice', false, tutorialHash(hash)),
    };
    for (const [name, href] of Object.entries(links)) {
      const url = new URL(href);
      const read = readPageUrl(url.search, url.hash);
      expect(read.refused, name).toBeUndefined();
      expect(read.query.get('mods'), name).toBe(name === 'enterPractice' ? 'fixture,fixture.practice' : 'fixture');
    }
    expect(readPageUrl(new URL(links.newWorld).search, new URL(links.newWorld).hash).hash.seed).toBe(4);
    expect(readPageUrl(new URL(links.replay).search, new URL(links.replay).hash).hash).toEqual({
      debug: true,
      seed: 3,
      radius: 64,
    });
  });
});
