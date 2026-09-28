import { describe, expect, it } from 'vitest';
import { DEFAULT_UI_STATE, parseUiState } from '../src/viewer/uiState.ts';

describe('viewer UI state', () => {
  it('defaults when storage is empty or invalid', () => {
    expect(parseUiState(null)).toEqual(DEFAULT_UI_STATE);
    expect(parseUiState('{broken')).toEqual(DEFAULT_UI_STATE);
    expect(parseUiState(JSON.stringify({ version: 2 }))).toEqual(DEFAULT_UI_STATE);
  });

  it('restores panel choices while defaulting missing or malformed fields', () => {
    expect(
      parseUiState(
        JSON.stringify({
          version: 1,
          assembly: { kind: 'fixture', name: 'archetype-smg' },
          template: 'smg',
          seed: '42',
          onlyValid: true,
          overrides: { params: { barrel: { length: 'L' } }, presence: { handguard: false } },
          layers: { solids: false, ports: true, keepOuts: false },
        }),
      ),
    ).toEqual({
      version: 1,
      assembly: { kind: 'fixture', name: 'archetype-smg' },
      template: 'smg',
      seed: '42',
      onlyValid: true,
      overrides: { params: { barrel: { length: 'L' } }, presence: { handguard: false } },
      layers: { solids: false, ports: true, keepOuts: false, axes: true },
    });
  });

  it('defaults malformed overrides', () => {
    expect(
      parseUiState(JSON.stringify({ version: 1, overrides: { params: { barrel: { length: 3 } } } })).overrides,
    ).toEqual({ params: {}, presence: {} });
  });
});
