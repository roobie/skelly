import { describe, expect, it, vi } from 'vitest';
import { benchDraw, benchPostFromUrl, postUrlPart } from '../src/bench/post.ts';
import { benchRunFromUrl } from '../src/bench/run.ts';
import { shamblerRunFromUrl } from '../src/bench/shamblers.ts';
import type { Engine } from '../src/game/engine.ts';

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

  it('captures scene counters in the mood scene-pass callback before post passes replace them', () => {
    const info = { render: { calls: 0, triangles: 0 } };
    let captured: { calls: number; triangles: number } | undefined;
    const engine = {
      renderer: { info, toneMapping: 0, toneMappingExposure: 1 },
      scene: {},
      camera: { position: {} },
      meshes: { setLinearColors: vi.fn(), setPatterns: vi.fn(), setOcclusion: vi.fn() },
      mood: {
        restore: vi.fn(),
        setSky: vi.fn(),
        render(afterScene: () => void) {
          info.render = { calls: 87, triangles: 54_321 };
          afterScene();
          info.render = { calls: 1, triangles: 0 }; // final fullscreen pass, the old incorrect sample
        },
      },
      shadows: { restore: vi.fn(), update: vi.fn() },
    } as unknown as Engine;

    benchDraw(engine, true, 23, (stats) => {
      captured = stats;
    })();

    expect(captured).toEqual({ calls: 87, triangles: 54_321 });
    expect(info.render).toEqual({ calls: 1, triangles: 0 });
  });
});
