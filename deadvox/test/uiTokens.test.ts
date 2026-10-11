// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { applyUiTokens } from '../src/ui/uiTokens.ts';

it('applies validated core-mod UI tuning to document-root CSS properties', () => {
  const { registry, issues } = buildRegistry([
    {
      source: 'ui-fixture.json',
      data: { ui: [{ id: 'core', spacingUnit: 12, hudScale: 1.25 }] },
    },
  ]);
  expect(issues).toEqual([]);

  const root = document.createElement('html');
  applyUiTokens(registry, root);

  expect(root.style.getPropertyValue('--ui-unit')).toBe('12px');
  expect(root.style.getPropertyValue('--ui-scale')).toBe('1.25');
});

it('rejects non-positive UI spacing and scale', () => {
  const issues = validateContent({
    source: 'invalid-ui-fixture.json',
    data: { ui: [{ id: 'core', spacingUnit: 0, hudScale: 0 }] },
  });
  expect(issues.map(({ path }) => path)).toEqual(['ui[0].spacingUnit', 'ui[0].hudScale']);
});
