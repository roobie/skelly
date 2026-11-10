export {
  applyOverlay,
  decodeFrame,
  groundFit,
  idleBase,
  sampleClip,
  standingFit,
  walkCursor,
} from './core/actorClips.ts';
export { bodyPlanModel, figureVariantOf } from './core/actorModels.ts';
export {
  type ActorPoseScene,
  acidSpitWindupProgress,
  actorCrawls,
  actorPoseInputFor,
  posedActor,
} from './core/actorPose.ts';
export {
  FIGURE_BOXES,
  FIGURE_PARTS,
  type FigureBox,
  type FigurePart,
  type HumanoidHitRegion,
} from './core/actorRegions.ts';
export { adsCameraEye, guardAdsCamera } from './core/adsView.ts';
export { type AimFrame, aimDirection, NEUTRAL_AIM } from './core/aim.ts';
export { attachmentFrame } from './core/attachmentFrame.ts';
export {
  applyPoint,
  IDENTITY_M,
  type Mat3,
  mat3ToQuat,
  mulMM,
  mulMV,
  type Quat,
  quatToMat3,
  rotX,
  rotY,
  slerpQuat,
  type Transform,
  transpose,
  type Vec3,
} from './core/boneMath.ts';
export { type BodyAnchor, type Bone, type BuiltBone, bodySkeleton } from './core/bones.ts';
export { severableParts, severedBoneSet } from './core/boneTree.ts';
export { type FirearmAimOffHand, firearmAimOffHand } from './core/firearmAimOffHand.ts';
export { firearmAimHandPose } from './core/firearmAimPose.ts';
export { sightedFirearmModel } from './core/firearmSight.ts';
export { missingFlesh, worldPosition } from './core/fusedMassCarving.ts';
export {
  FUSED_MASS_FIGURE_SEED,
  type FusedMassFigure,
  type FusedMassGrid,
  fusedMassCollisionEnvelope,
  fusedMassTypeOf,
} from './core/fusedMassFigure.ts';
export {
  blendHeldFirearmTransforms,
  type HeldFirearmTransformInput,
  type HeldHoldFrame,
  type HeldSeatFrame,
  heldAdsStandoffMetres,
  heldAnchorOffset,
  heldFirearmTransform,
  heldGripOffset,
  heldHoldFrame,
  heldLoweredPitch,
  heldProneSupportAt,
  heldTorsoForwardDegrees,
  modelToView,
  readyFirearmPose,
  throwStanceHandOffset,
} from './core/heldPose.ts';
export { clampJointAngles, jointAngles, jointRotation } from './core/joints.ts';
export type { LeanFrame } from './core/lean.ts';
export { bodyPartMass, boneVoxelCentres, massProperties, voxelBounds } from './core/massProperties.ts';
export {
  type HandPose,
  interpolateHandPose,
  type MeleeActionPose,
  type MeleeHand,
  type MeleePoseFrame,
  meleePoseAndContact,
  readyMeleePose,
} from './core/meleePose.ts';
export {
  mountedOptic,
  type OpticLensFrame,
  type OpticZoomFrame,
  opticFieldOfView,
  opticRendersWorld,
  opticViewSettings,
  presentedOptic,
  projectLensAperture,
  projectOpticReticle,
} from './core/opticView.ts';
export { playerAdsPose } from './core/playerAdsPose.ts';
export {
  type FigureStancePose,
  figureStancePose,
  type PlayerAdsPose,
  type PlayerLookPose,
  playerEyePosition,
  playerHeldSeatFrame,
  playerLeanPoint,
  playerLookPose,
  playerPosePoint,
} from './core/playerLookPose.ts';
export type { PlayerStance } from './core/playerStance.ts';
export {
  allocateBoneTransforms,
  blendPose,
  boneTransforms,
  boneTransformsInto,
  indexBonesByParent,
  type MutableTransform,
  type ParentIndex,
  type Pose,
} from './core/pose.ts';
export { revolverChamberPoint } from './core/revolverPose.ts';
export { type StepOffsetState, updateStepOffset } from './core/stepOffset.ts';
