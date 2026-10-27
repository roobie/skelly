import { describe, expect, it } from 'vitest';
import { parseOverrides } from '@skelly/tool-ui/param-panel';
import { setModelQuery } from '../src/viewer/shareUrl.ts';

describe('shareable model query', () => {
  it('keeps panel overrides when linking to a design', () => {
    const params = new URLSearchParams();
    setModelQuery(params, {
      designName: 'archetype-ar',
      designNames: ['archetype-ar'],
      assembly: { kind: 'fixture', name: 'archetype-ar' },
      template: 'ar',
      seed: '0',
      overrides: { params: { barrel: { length: 'extended' } }, presence: {} },
    });

    expect(params.get('design')).toBe('archetype-ar');
    expect(parseOverrides(params.get('set')!)).toEqual({ params: { barrel: { length: 'extended' } }, presence: {} });
  });
});
