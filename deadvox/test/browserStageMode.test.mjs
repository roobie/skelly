import { describe, expect, it } from 'vitest';
import { browserStageArgs, browserStageMode, browserStageUrl } from './browser/stage-mode.mjs';

describe('browser stage rendering mode', () => {
  it('selects render-free mode and matching Chromium flags for logic stages', () => {
    expect(browserStageMode('primary-action')).toBe('render-free');
    expect(browserStageArgs('primary-action')).toContain('--disable-gpu');
    expect(browserStageArgs('primary-action')).not.toContain('--use-gl=swiftshader');
    expect(browserStageUrl('primary-action', 'http://localhost/?seed=1')).toBe('http://localhost/?seed=1&render=0');
  });

  it('keeps pixel stages on SwiftShader and removes a render-free URL override', () => {
    expect(browserStageMode('stairs-lighting')).toBe('pixel');
    expect(browserStageArgs('stairs-lighting')).toContain('--use-gl=swiftshader');
    expect(browserStageArgs('stairs-lighting')).toContain('--enable-unsafe-swiftshader');
    expect(browserStageUrl('stairs-lighting', 'http://localhost/?seed=1&render=0')).toBe('http://localhost/?seed=1');
  });

  it('rejects inherited property names as unknown stages', () => {
    expect(() => browserStageMode('toString')).toThrow('Unknown browser stage mode: toString');
  });
});
