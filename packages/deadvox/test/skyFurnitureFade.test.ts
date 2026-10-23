import { expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { buildSkyResult, sampleSky } from '../src/core/skyTransport.ts';
import { flashlightDaylightScale } from '../src/render/flashlight.ts';
import { skyFixture } from './fixtures/sky.ts';

/** The fixture room with a window in its west wall, and optionally a piece standing against the back wall. */
const room = (furnished: boolean) => {
  const fixture = skyFixture();
  for (let y = 2; y <= 6; y++) {
    for (let z = 6; z <= 10; z++) {
      fixture.world.setBlock(4, y, z, 0);
    }
  }
  if (furnished) {
    for (const pos of [
      [8, 2, 11],
      [8, 3, 11],
    ] satisfies Vec3[]) {
      fixture.entities.add({ type: 'fixture_door', pos, size: [1, 1, 1], facing: 'n' });
    }
  }
  return buildSkyResult(fixture.capture().input).volume!;
};

it('never lets furniture brighten a fixture glow on the wall behind it', () => {
  const daylight = { lightIntensity: 1, ambientIntensity: 1 };
  const open = room(false);
  const furnished = room(true);
  const glow = (volume: typeof open, point: Vec3) =>
    flashlightDaylightScale(daylight, sampleSky(volume, point, 'unfurnished'));
  const wall = Array.from({ length: 14 }, (_, i): Vec3 => [5 + i / 2, 2.5, 11.5]);
  const behind: Vec3 = [8.5, 2.5, 11.5];
  // Guards against a vacuous pass: the piece shades the wall, and daylight fades the glow there.
  expect(sampleSky(furnished, behind)).toBeLessThan(sampleSky(open, behind));
  expect(glow(open, behind)).toBeLessThan(1);
  for (const point of wall) {
    expect(glow(furnished, point), `glow at ${point}`).toBeLessThanOrEqual(glow(open, point) + 1e-9);
  }
});
