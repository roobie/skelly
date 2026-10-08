import { INPUT_BINDINGS } from '../src/game/inputBindings.ts';

interface TestHouseRangeWaypoint {
  readonly id: string;
  readonly axis: 0 | 2;
  readonly target: number;
}

interface TestHouseRangeRoute {
  readonly gateCentreX: number;
  readonly gateClearance: number;
  readonly waypoints: readonly TestHouseRangeWaypoint[];
}

/** Waypoint geometry shared by the unit and browser collision contracts for the debug range. */
const movementCandidates = [
  { actionId: 'movement.forward', forward: 1, right: 0 },
  { actionId: 'movement.back', forward: -1, right: 0 },
  { actionId: 'movement.right', forward: 0, right: 1 },
  { actionId: 'movement.left', forward: 0, right: -1 },
] as const;

export const routeMovementInput = (axis: 0 | 2, direction: -1 | 1, yaw: number) => {
  if (!Number.isFinite(yaw)) {
    throw new Error('Test-house route movement needs a finite look yaw');
  }
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const candidate = movementCandidates
    .map((movement) => ({
      ...movement,
      projection:
        (axis === 0 ? -sin * movement.forward + cos * movement.right : -cos * movement.forward - sin * movement.right) *
        direction,
    }))
    .reduce((best, movement) => (movement.projection > best.projection ? movement : best));
  const binding = INPUT_BINDINGS.find(({ id }) => id === candidate.actionId);
  if (!binding) {
    throw new Error(`Test-house route movement action is not bound: ${candidate.actionId}`);
  }
  return { action: binding.id, forward: candidate.forward, right: candidate.right };
};

export const buildTestHouseRangeRoute = ({
  blockSize,
  playerHalfWidth,
  rack,
  houseOffset,
  gardenGate,
}: {
  blockSize: number;
  playerHalfWidth: number;
  rack: { readonly pos: readonly number[]; readonly size: readonly number[] };
  houseOffset: readonly [number, number];
  gardenGate: { readonly approachZ: number; readonly centreX: number; readonly exitZ: number; readonly widthM: number };
}): TestHouseRangeRoute => {
  const corridorZ = (houseOffset[1] + gardenGate.approachZ) / blockSize;
  const gateCentreX = (houseOffset[0] + gardenGate.centreX) / blockSize;
  const gateClearance = gardenGate.widthM / (2 * blockSize) - playerHalfWidth;
  if (gateClearance <= 0) {
    throw new Error('Player does not fit through the test-house garden gate');
  }
  return {
    gateCentreX,
    gateClearance,
    waypoints: [
      { id: 'approach-gate', axis: 2, target: corridorZ },
      { id: 'enter-gate', axis: 0, target: gateCentreX - gateClearance },
      { id: 'centre-in-gate', axis: 0, target: gateCentreX },
      { id: 'exit-gate', axis: 2, target: (houseOffset[1] + gardenGate.exitZ) / blockSize },
      { id: 'approach-rack', axis: 0, target: rack.pos[0]! - 1 },
      {
        id: 'rack-facing-stop',
        axis: 2,
        target: rack.pos[2]! + rack.size[2]! + playerHalfWidth + 0.2 / blockSize,
      },
    ],
  };
};
