import { steppedItemFlight } from '../src/core/itemThrow.ts';

export const presentationFlight = steppedItemFlight({
  from: [0, 1, 0],
  direction: [1, 0, 0],
  distanceMetres: 2,
  gravityMetresPerSimSecondSquared: 1,
  flightSimSeconds: 1,
  drag: 0.1,
  blockSize: 1,
  minY: -2,
  isSolid: (_x, y) => y < 0,
});
