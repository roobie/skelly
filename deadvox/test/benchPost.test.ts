import { describe, expect, it } from 'vitest';
import { benchPostFromUrl, postUrlPart } from '../src/bench/post.ts';
import { benchRunFromUrl } from '../src/bench/run.ts';
import { shamblerRunFromUrl } from '../src/bench/shamblers.ts';

const params = (query: string) => new URLSearchParams(query);

describe('benchmark post-processing option', () => {
  it('is off unless &post=1, so the default benchmark renders as it always did', () => {
    expect(benchPostFromUrl(params('bench=1'))).toBe(false);
    expect(benchPostFromUrl(params('bench=1&post=0'))).toBe(false);
    expect(benchPostFromUrl(params('bench=1&post=true'))).toBe(false);
    expect(benchPostFromUrl(params('bench=1&post=1'))).toBe(true);
  });

  it('is carried in the next-run URL fragment only when on', () => {
    expect(postUrlPart(true)).toBe('&post=1');
    expect(postUrlPart(false)).toBe('');
  });

  it('is read by both benchmark modes', () => {
    expect(benchRunFromUrl(params('bench=1')).post).toBe(false);
    expect(benchRunFromUrl(params('bench=1&post=1')).post).toBe(true);
    expect(shamblerRunFromUrl(params('bench=shamblers'))?.post).toBe(false);
    expect(shamblerRunFromUrl(params('bench=shamblers&post=1'))?.post).toBe(true);
  });
});
