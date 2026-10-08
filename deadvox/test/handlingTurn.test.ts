import { Euler, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { ModelDef } from '../src/core/content.ts';
import type { HandSide } from '../src/core/inventory.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { handlingRotation } from '../src/render/handlingTurn.ts';

const { registry } = BUNDLED_CONTENT;
const AR = registry.models.get('rifle_assault')!;
const AK = registry.models.get('rifle_ak')!;
const NO_GRIP = { x: 0, y: 0 };

/** The rotation a rack adds while the hand holds the handle back. */
const midRack = (model: ModelDef, side: HandSide) => {
  const { hand } = model.action!;
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
      const [pitch, yaw, roll] = midRack(AR, side);
      const held = (vector: Vector3) => vector.applyEuler(new Euler(pitch, yaw, roll, 'YXZ'));
      // The side away from the off hand, the gun's right for a right-hander, comes round to face the player (+z).
      expect(held(new Vector3(side === 'right' ? 1 : -1, 0, 0)).z).toBeGreaterThan(0);
      expect(rollTowardOffHand(AR, side)).toBeGreaterThan(0);
    },
  );

  it('rolls a handle on the far side from the off hand further, and mirrors that for a left-hander', () => {
    // The AK's handle is on the gun's right, the AR's on top.
    expect(rollTowardOffHand(AK, 'right')).toBeGreaterThan(rollTowardOffHand(AR, 'right'));
    expect(rollTowardOffHand(AK, 'left')).toBeLessThan(rollTowardOffHand(AR, 'left'));
    const mirrored = { ...AK, chargingHandleDegrees: -(AK.chargingHandleDegrees ?? 0) };
    const [pitch, yaw, roll] = midRack(AK, 'left');
    const [rightPitch, rightYaw, rightRoll] = midRack(mirrored, 'right');
    expect([pitch, -yaw, -roll]).toEqual([
      expect.closeTo(rightPitch, 12),
      expect.closeTo(rightYaw, 12),
      expect.closeTo(rightRoll, 12),
    ]);
  });
});
