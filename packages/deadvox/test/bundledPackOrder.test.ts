import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { bundledPacks } from '../src/game/bundledPacks.ts';
import { readBundledPacks } from '../tools/readBundledPacks.ts';

it('orders bundled pack roots in the browser as the build stamps them', () => {
  const built = readBundledPacks(resolve(import.meta.dirname, '..')).map(({ source }) => source);
  expect(bundledPacks.map(({ root }) => root)).toEqual(built);
});
