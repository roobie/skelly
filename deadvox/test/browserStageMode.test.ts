import { describe, expect, it } from 'vitest';
import { browserStageArgs, browserStageMode, browserStageUrl } from './browser/stage-mode.mjs';

describe('browser stage rendering mode', () => {
  it('selects render-free mode and matching Chromium flags for logic stages', () => {
    expect(browserStageMode('primary-action')).toBe('render-free');
    expect(browserStageMode('pump-handling')).toBe('render-free');
    expect(browserStageMode('ui-browser-contract')).toBe('render-free');
    expect(browserStageArgs('ui-browser-contract')).toContain('--disable-gpu');
    expect(browserStageArgs('ui-browser-contract')).not.toContain('--use-gl=swiftshader');
    expect(browserStageUrl('ui-browser-contract', 'http://localhost/?seed=1')).toBe(
      'http://localhost/?seed=1&render=0',
    );
    expect(browserStageArgs('primary-action')).toContain('--disable-gpu');
    expect(browserStageArgs('primary-action')).not.toContain('--use-gl=swiftshader');
    expect(browserStageUrl('primary-action', 'http://localhost/?seed=1')).toBe('http://localhost/?seed=1&render=0');
  });

  it('keeps pixel stages on SwiftShader and removes a render-free URL override', () => {
    expect(browserStageMode('primary-action-pixel')).toBe('pixel');
    expect(browserStageArgs('primary-action-pixel')).toContain('--use-gl=swiftshader');
    expect(browserStageUrl('primary-action-pixel', 'http://localhost/?seed=1&render=0')).toBe(
      'http://localhost/?seed=1',
    );
    expect(browserStageMode('stairs-camo')).toBe('pixel');
    expect(browserStageMode('stairs-lighting')).toBe('pixel');
    expect(browserStageMode('save-storage-opfs-continue')).toBe('pixel');
    expect(browserStageArgs('save-storage-opfs-continue')).toContain('--use-gl=swiftshader');
    expect(browserStageMode('save-storage-indexeddb-continue')).toBe('pixel');
    expect(browserStageArgs('save-storage-indexeddb-continue')).toContain('--use-gl=swiftshader');
    expect(browserStageUrl('save-storage-opfs-continue', 'http://localhost/?seed=1&render=0')).toBe(
      'http://localhost/?seed=1',
    );
    expect(browserStageUrl('save-storage-indexeddb-continue', 'http://localhost/?seed=1&render=0')).toBe(
      'http://localhost/?seed=1',
    );
    expect(browserStageArgs('stairs-camo')).toContain('--use-gl=swiftshader');
    expect(browserStageArgs('stairs-lighting')).toContain('--use-gl=swiftshader');
    expect(browserStageArgs('stairs-lighting')).toContain('--enable-unsafe-swiftshader');
    expect(browserStageUrl('stairs-lighting', 'http://localhost/?seed=1&render=0')).toBe('http://localhost/?seed=1');
  });

  it('rejects inherited property names as unknown stages', () => {
    expect(() => browserStageMode('toString')).toThrow('Unknown browser stage mode: toString');
  });
});
