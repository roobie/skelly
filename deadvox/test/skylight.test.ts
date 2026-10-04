import { expect, it } from 'vitest';
import { buildSkylight, SKY_LOSS, skyIndex } from '../src/core/skylight.ts';

it('a sealed roof prevents diffuse sky while a real hole admits it only along air paths', () => {
  const bounds = { min: [0, 0, 0] as [number, number, number], max: [8, 8, 8] as [number, number, number] };
  const solid = (x: number, y: number, z: number) => x === 0 || z === 0 || x === 7 || z === 7 || y === 0 || y === 7;
  const closed = buildSkylight(bounds, 7, solid);
  const at = (x: number, y: number, z: number) => skyIndex(closed.size, x, y, z);
  expect(closed.light[at(3, 3, 3)]).toBe(0);
  const opened = buildSkylight(bounds, 7, (x, y, z) => solid(x, y, z) && !(x === 3 && z === 3 && y === 7));
  expect(opened.light[at(3, 3, 3)]).toBe(255);
  expect(opened.light[at(4, 3, 3)]).toBe(255 - SKY_LOSS);
  expect(opened.light[at(0, 3, 3)]).toBe(0);
});
