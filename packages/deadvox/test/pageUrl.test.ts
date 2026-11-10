import { describe, expect, it } from 'vitest';
import { type HashState, readHash, writeHash } from '../src/hashState.ts';
import { readPageUrl } from '../src/pageUrl.ts';
import { newWorldHref, tutorialHash } from '../src/product/page.ts';
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

  it('quotes a string that is not a bare word', () => {
    const hash: HashState = { focus: 'a b,c' };
    expect(readHash(writeHash(hash))).toEqual({ hash });
  });

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

  it('refuses a bench run setting left in the query, as it does on the game page', () => {
    expect(readPageUrl('?bench=1&plan=0.5:64', '').refused).toBe('plan');
    expect(readPageUrl('?bench=1', '#{plan:[0.5,64]}').refused).toBeUndefined();
  });

  it('hands the hash seed to the game configuration', () => {
    const { query, hash } = readPageUrl('', `#${writeHash({ seed: 4321 })}`);
    expect(configFromUrl(query, hash).seed).toBe(4321);
    expect(configFromUrl(query, {}).seed).not.toBe(4321);
  });
});

describe('page links', () => {
  it('starts a new world with the hash seed, keeping the rest of the hash and dropping the start time', () => {
    const next = new URL(newWorldHref('https://example.org/?mods=fixture&time=12:00#{debug:true}', { debug: true }, 4));
    expect(next.searchParams.get('mods')).toBe('fixture');
    expect(next.searchParams.has('time')).toBe(false);
    expect(readHash(next.hash)).toEqual({ hash: { debug: true, seed: 4 } });
  });

  it('carries only the view radius and actor models into and out of practice', () => {
    expect(readHash(tutorialHash({ debug: true, seed: 3, radius: 64, actors: 'boxes' }))).toEqual({
      hash: { radius: 64, actors: 'boxes' },
    });
  });
});
