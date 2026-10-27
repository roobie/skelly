import { NEUTRAL_AIM } from './aim.ts';
import type { FigureDef, ModelDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type HeldFirearmTransform, heldFirearmTransform } from './heldPose.ts';
import type { PlayerAdsPose, PlayerLookPose } from './playerLookPose.ts';
import { raycast, type SolidAt } from './raycast.ts';
import { add, axisRotation, dot, rotateVector, scale, sub } from './spatial.ts';

export const adsLimits = (figure: FigureDef, model: ModelDef) => ({
  cameraOffsetMetres: model.hands?.ads?.cameraOffsetLimitMetres ?? figure.aimPose.ads.cameraOffsetLimitMetres,
  stockShoulderMetres: model.hands?.ads?.stockShoulderLimitMetres ?? figure.aimPose.ads.stockShoulderLimitMetres,
});

export const nearestSightEyeOffset = (gun: HeldFirearmTransform): Vec3 | undefined => {
  if (!gun.sightEyeOffset) {
    return undefined;
  }
  if (!gun.sightEyeRangeOffsets) {
    return add(gun.rootOffset, gun.sightEyeOffset);
  }
  const [near, far] = gun.sightEyeRangeOffsets.map((point) => add(gun.rootOffset, point));
  const span = sub(far!, near!);
  const fraction = Math.max(0, Math.min(1, -dot(near!, span) / dot(span, span)));
  return add(near!, scale(span, fraction));
};

export const adsCameraEye = ({
  figure,
  pose,
  ads,
  pitch,
}: {
  figure: FigureDef;
  pose: PlayerLookPose;
  ads: PlayerAdsPose;
  pitch: number;
}) => {
  const gun = heldFirearmTransform({
    holds: figure.holds,
    model: ads.model,
    side: ads.side,
    leadingSide: ads.side,
    twoHanded: true,
    progress: 1,
    aimingDownSights: true,
    aimFrame: ads.aimFrame ?? NEUTRAL_AIM,
    loweredPitchRadians: 0,
    stockSeat: pose.stockSeats[ads.side],
  });
  const offset: Vec3 = nearestSightEyeOffset(gun) ?? [0, 0, 0];
  const distanceMetres = Math.hypot(...offset);
  const limitMetres = adsLimits(figure, ads.model).cameraOffsetMetres;
  const fits = distanceMetres <= limitMetres;
  const candidate = add(pose.eye, rotateVector(axisRotation([1, 0, 0], pitch), offset));
  // A failed intersection must not be clamped off the sight line or move the firearm to hide missing authoring.
  return { eye: fits ? candidate : pose.eye, candidate, offset, distanceMetres, limitMetres, fits };
};

export const guardAdsCamera = ({
  bodyEye,
  cameraEye,
  blockSize,
  marginMetres,
  isSolid,
}: {
  bodyEye: Vec3;
  cameraEye: Vec3;
  blockSize: number;
  marginMetres: number;
  isSolid: SolidAt;
}): Vec3 => {
  const delta = sub(cameraEye, bodyEye);
  const distance = Math.hypot(...delta);
  if (distance === 0) {
    return cameraEye;
  }
  const direction = scale(delta, 1 / distance);
  const hit = raycast(bodyEye, direction, distance, isSolid);
  if (!hit) {
    return cameraEye;
  }
  return add(bodyEye, scale(direction, Math.max(0, hit.distance - marginMetres / blockSize)));
};
