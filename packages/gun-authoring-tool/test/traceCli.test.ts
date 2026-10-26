import { expect, it } from 'vitest';
import { positiveArgument } from '../src/cli/traceCli.ts';

it('names the invalid numeric flag rather than failing later in projection', () => {
  expect(() => positiveArgument('NaN', '--mm-per-pixel')).toThrow('--mm-per-pixel');
  expect(() => positiveArgument('0', '--bar-mm')).toThrow('--bar-mm');
  expect(positiveArgument('0.5', '--mm-per-pixel')).toBe(0.5);
});
