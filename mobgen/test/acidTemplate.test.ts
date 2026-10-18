import { expect, it } from 'vitest';
import { consumableTemplate } from '../src/core/template.ts';
import { acidTemplate } from '../src/mob/acidTemplate.ts';

it('the acid template refuses consumption until its game contracts are supported', () => {
  expect(() => consumableTemplate(acidTemplate.name)).toThrow('comparison-only');
});
