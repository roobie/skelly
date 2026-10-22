import { expect, it } from 'vitest';
import { SKY_LOSS, skyIndex } from '../src/core/skylight.ts';
import { buildSkyResult } from '../src/core/skyTransport.ts';
import { skyFixture } from './fixtures/sky.ts';

it('a sealed roof prevents diffuse sky while a real hole admits it only along air paths', () => {
  const fixture = skyFixture();
  const lightAt = (x: number, y: number, z: number) => {
    const { volume } = buildSkyResult(fixture.capture().input);
    const [x0, y0, z0] = volume!.min;
    return volume!.light[skyIndex(volume!.size, x - x0, y - y0, z - z0)];
  };
  expect(lightAt(8, 5, 8)).toBe(0);
  fixture.world.setBlock(8, 9, 8, 0);
  expect(lightAt(8, 5, 8)).toBe(255);
  expect(lightAt(9, 5, 8)).toBe(255 - SKY_LOSS);
  expect(lightAt(4, 5, 8)).toBe(0);
});
