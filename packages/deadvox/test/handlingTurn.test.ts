import type { ModelDef } from '@skelly/engine/content';
import type { HandSide } from '@skelly/engine/inventory';
import { Euler, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { pressCheckAt } from '@skelly/presentation/internal/render/firearmModel.ts';
import { handlingLook, handlingRotation, handlingShift } from '@skelly/presentation/internal/render/handlingTurn.ts';

const { registry } = BUNDLED_CONTENT;
// A racked rifle with a detachable magazine; the fixtures differ only in where the charging handle sits.
const rifle = [...registry.models.values()].find(({ gun }) => gun?.action && !gun.internalMagazine && !gun.revolver)!;
const withHandle = (id: string, chargingHandleDegrees: number): ModelDef => ({
  ...rifle,
  id,
  gun: { ...rifle.gun!, chargingHandleDegrees },
});
/** Handle on top of the receiver. */
const TOP = withHandle('fixture_top_handle', 0);
/** Handle on the gun's right, the far side from a right-hander's off hand. */
const RIGHT = withHandle('fixture_right_handle', 90);
const NO_GRIP = { x: 0, y: 0 };

/** The rotation a rack adds while the hand holds the handle back. */
const midRack = (model: ModelDef, side: HandSide) => {
  const { hand } = model.gun!.action!;
  const frame = {
    uid: 1,
    mode: 'hand' as const,
    elapsed: hand.rearwardSimSeconds + hand.dwellSimSeconds / 2,
    duration: hand.durationSimSeconds,
  };
  return handlingRotation(model, side, frame, NO_GRIP);
};
/** The roll toward the off hand: counter-clockwise as the player sees it when the off hand is on the left. */
const rollTowardOffHand = (model: ModelDef, side: HandSide) => midRack(model, side)[2] * (side === 'right' ? 1 : -1);

describe('a rack turns a held rifle for its off hand', () => {
  it.each(['right', 'left'] as const)(
    'turns the gun toward the player and rolls the handle toward the %s-hander’s off hand',
    (side) => {
      const [pitch, yaw, roll] = midRack(TOP, side);
      const held = (vector: Vector3) => vector.applyEuler(new Euler(pitch, yaw, roll, 'YXZ'));
      // The side away from the off hand, the gun's right for a right-hander, comes round to face the player (+z).
      expect(held(new Vector3(side === 'right' ? 1 : -1, 0, 0)).z).toBeGreaterThan(0);
      expect(rollTowardOffHand(TOP, side)).toBeGreaterThan(0);
    },
  );

  it('rolls a handle on the far side from the off hand further, and mirrors that for a left-hander', () => {
    expect(rollTowardOffHand(RIGHT, 'right')).toBeGreaterThan(rollTowardOffHand(TOP, 'right'));
    expect(rollTowardOffHand(RIGHT, 'left')).toBeLessThan(rollTowardOffHand(TOP, 'left'));
    const mirrored = withHandle('fixture_left_handle', -RIGHT.gun!.chargingHandleDegrees!);
    const [pitch, yaw, roll] = midRack(RIGHT, 'left');
    const [rightPitch, rightYaw, rightRoll] = midRack(mirrored, 'right');
    expect([pitch, -yaw, -roll]).toEqual([
      expect.closeTo(rightPitch, 12),
      expect.closeTo(rightYaw, 12),
      expect.closeTo(rightRoll, 12),
    ]);
  });
});

describe('a press check lifts a held rifle toward the eye', () => {
  const checked = [...registry.models.values()].find(({ gun }) => gun?.pressCheck)!;
  const at = (elapsed: number) => ({ uid: 1, mode: 'press-check' as const, elapsed, duration: 1 });
  // The moment the clip draws the carrier furthest back, which is when the port must show.
  const stroke = (elapsed: number) =>
    Math.max(...Object.values(pressCheckAt(checked.gun!.pressCheck!, at(elapsed)).parts));
  const carrierBack = at(
    Array.from({ length: 101 }, (_, step) => step / 100).reduce((best, elapsed) =>
      stroke(elapsed) > stroke(best) ? elapsed : best,
    ),
  );

  it('starts and ends at the hold, with no turn, no lift and no look', () => {
    for (const elapsed of [0, 1]) {
      for (const side of ['right', 'left'] as const) {
        expect(handlingShift(checked, side, at(elapsed)).map(Math.abs)).toEqual([0, 0, 0]);
        expect(handlingRotation(checked, side, at(elapsed), NO_GRIP).map(Math.abs)).toEqual([0, 0, 0]);
        expect(Object.values(handlingLook(checked, side, at(elapsed))).map(Math.abs)).toEqual([0, 0]);
      }
    }
  });

  it.each(['right', 'left'] as const)('lifts the gun up, back and across toward the %s-hander’s off hand', (side) => {
    const [across, up, back] = handlingShift(checked, side, carrierBack);
    expect(up).toBeGreaterThan(0);
    expect(back).toBeGreaterThan(0);
    expect(across * (side === 'right' ? -1 : 1)).toBeGreaterThan(0);
  });

  it.each(['right', 'left'] as const)('turns the %s-hander’s eyes down toward the port it lifts', (side) => {
    const { yaw, pitch } = handlingLook(checked, side, carrierBack);
    expect(pitch).toBeLessThan(0);
    expect(yaw * (side === 'right' ? 1 : -1)).toBeGreaterThan(0);
  });
});
