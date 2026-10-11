// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { buildRegistry, requiredUiIssues, validateContent } from '../src/core/content.ts';
import { applyUiTokens } from '../src/ui/uiTokens.ts';

it('applies validated core-mod UI tuning to document-root CSS properties', () => {
  const { registry, issues } = buildRegistry([
    {
      source: 'ui-fixture.json',
      data: { ui: [{ id: 'core', spacing: 0.75, hudScale: 1.25 }] },
    },
  ]);
  expect(issues).toEqual([]);

  const root = document.createElement('html');
  applyUiTokens(registry, root);

  expect(root.style.getPropertyValue('--ui-spacing')).toBe('0.75');
  expect(root.style.getPropertyValue('--ui-scale')).toBe('1.25');
});

it('rejects non-positive UI spacing and scale', () => {
  const issues = validateContent({
    source: 'invalid-ui-fixture.json',
    data: { ui: [{ id: 'core', spacing: 0, hudScale: 0 }] },
  });
  expect(issues.map(({ path }) => path)).toEqual(['ui[0].spacing', 'ui[0].hudScale']);
});

it('reports content without the core UI tuning at validation, not at startup', () => {
  const { registry } = buildRegistry([
    { source: 'other-ui.json', data: { ui: [{ id: 'other', spacing: 1, hudScale: 1 }] } },
  ]);
  expect(requiredUiIssues(registry, 'ui.json').map(({ path }) => path)).toEqual(['ui']);
});
