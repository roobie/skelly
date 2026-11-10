import { describe, expect, it } from 'vitest';
import { type BrowserStageMode, browserStageArgs, browserStageMode, browserStageUrl } from './browser/stage-mode.mjs';

// Any registered stage: the override selects each mode, so the rules are checked per mode rather than per stage.
const stage = 'primary-action';
// The game page's developer state is in the hash, which the render switch on the query must keep.
const address = 'http://localhost/?site=testHouse#{seed:1}';
const rendered = 'http://localhost/?site=testHouse&render=0#{seed:1}';
const swiftShader = ['--use-gl=angle', '--use-angle=swiftshader'];

describe('browser stage rendering mode', () => {
  it('render-free mode disables the GPU and opts the URL out of rendering', () => {
    const args = browserStageArgs(stage, [], 'render-free');
    expect(args).toContain('--disable-gpu');
    for (const flag of [...swiftShader, '--enable-unsafe-swiftshader']) {
      expect(args).not.toContain(flag);
    }
    expect(browserStageUrl(stage, address, 'render-free')).toBe(rendered);
  });

  it('pixel mode renders on SwiftShader and removes a render-free URL override', () => {
    const args = browserStageArgs(stage, [], 'pixel');
    expect(args).toEqual(expect.arrayContaining([...swiftShader, '--enable-unsafe-swiftshader']));
    expect(args).not.toContain('--disable-gpu');
    expect(browserStageUrl(stage, rendered, 'pixel')).toBe(address);
  });

  it('a pixel stage with an explicit --use-gl keeps the caller GL backend instead of SwiftShader ANGLE', () => {
    const explicit = '--use-gl=egl';
    const args = browserStageArgs(stage, [explicit], 'pixel');
    expect(args).toContain(explicit);
    expect(args).toContain('--enable-unsafe-swiftshader');
    for (const flag of swiftShader) {
      expect(args).not.toContain(flag);
    }
  });

  it('a render-free stage leaves a bench URL rendering', () => {
    const bench = 'http://localhost/?seed=1&bench=forest';
    expect(browserStageUrl(stage, bench, 'render-free')).toBe(bench);
  });

  it('a stage without an override launches and opens by its own mode', () => {
    const mode: BrowserStageMode = browserStageMode(stage);
    expect(browserStageArgs(stage)).toEqual(browserStageArgs(stage, [], mode));
    expect(browserStageUrl(stage, address)).toBe(browserStageUrl(stage, address, mode));
  });

  it('rejects inherited property names as unknown stages', () => {
    expect(() => browserStageMode('toString')).toThrow('Unknown browser stage mode: toString');
  });
});
