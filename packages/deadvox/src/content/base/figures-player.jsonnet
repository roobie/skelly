// Temporary role readability on the underwear base; delete with corpse-owned equipment in #1366.
local outfit(skin, shirt, pants, shoe) = {
  torso: { skin: shirt }, pelvis: { underwear: pants },
  neck: { skin: skin }, head: { skin: skin },
  upper: { skin: shirt }, fore: { skin: skin }, palm: { skin: skin },
  fingers: { skin: skin }, thumb: { skin: skin },
  thigh: { skin: pants }, shin: { skin: pants }, foot: { skin: shoe },
};
local limb(model, joint) = { model: model, joint: joint };
local segment(part, pivot) = { part: part, pivot: pivot };
local frame(part, pivot=null) = {
  part: part, at: [0, 0, 0], turn: [0, 0, 0], insideView: false,
} + if pivot == null then {} else { pivot: pivot };
local bust = [model for model in (import 'models-items.jsonnet').models if model.id == 'player_bust'][0];
local torsoFrame = frame('body', 'spine') + { at: [0 - value for value in bust.anchors.spine] };
local handPose(fingers, thumbAcross, thumbIn) = {
  fingersDegrees: fingers,
  thumbAcrossDegrees: thumbAcross,
  thumbInDegrees: thumbIn,
};
{
  figures: [
    {
      id: 'player',
      // Stands the bust's eyes at the player's eye height; the leg model's hip-to-sole length matches it.
      hipHeightMetres: 0.82,
      body: {
        model: 'player_bust',
        joints: {
          leftHip: 'hip_left',
          rightHip: 'hip_right',
          leftShoulder: 'shoulder_left',
          rightShoulder: 'shoulder_right',
        },
        spine: segment('torso', 'spine'),
        neck: segment('neck', 'neck'),
        head: segment('head', 'head'),
        eyes: ['eye_left', 'eye_right'],
      },
      // Each limb is mirror-symmetric, so one model hangs on either side.
      limbs: {
        leftArm: limb('player_arm', 'shoulder'),
        rightArm: limb('player_arm', 'shoulder'),
        leftLeg: limb('player_leg', 'hip'),
        rightLeg: limb('player_leg', 'hip'),
      },
      // The first-person view turns each arm part about its joint. A fist closes hard; a hand on a grip leaves room
      // for the handle; a hand on a screen's back lies nearly flat. On a long gun the firing hand closes around the
      // pistol grip with the thumb over its top, or wraps the stock wrist with the fingers under it and the thumb over
      // it, and the support hand cups the forend from below with the fingers curling up its far side.
      armRig: {
        upper: segment('upper', 'shoulder'),
        fore: segment('fore', 'elbow'),
        hand: segment('palm', 'wrist'),
        fingers: segment('fingers', 'knuckles'),
        thumb: segment('thumb', 'thumb_root'),
        grip: 'grip',
        elbowPole: {
          up: [std.sqrt(0.5), -std.sqrt(0.5), 0],
          down: [0.5, -0.5, -std.sqrt(0.5)],
        },
        minimumBendDegrees: { up: 0, down: 45 },
        handPoses: {
          fist: handPose(95, 60, 45),
          holding: handPose(80, 50, 30),
          open: handPose(10, 10, 0),
          pistolGrip: handPose(85, 70, 35),
          stockWrist: handPose(90, 65, 35),
          forend: handPose(90, 55, 30),
        },
        // Where the view hangs the right arm, from the eye; the left mirrors it.
        shoulderFromEye: [0.3, -0.55, 0.05],
      },
      // Gear shares the body's anchors and camera mask so it cannot reveal a hidden body's interior.
      attachmentFrames: {
        head: { part: 'body', pivot: 'head', at: [0, 0.0804, 0], turn: [0, 180, 0], insideView: true },
        torso: torsoFrame,
        clothing_body: torsoFrame,
        left_sleeve: frame('leftArm'),
        right_sleeve: frame('rightArm'),
        left_cuff: frame('leftArm', 'elbow'),
        right_cuff: frame('rightArm', 'elbow'),
        left_trouser: frame('leftLeg'),
        right_trouser: frame('rightLeg'),
        left_hem: frame('leftLeg', 'knee'),
        right_hem: frame('rightLeg', 'knee'),
        left_boot: frame('leftLeg', 'ankle'),
        right_boot: frame('rightLeg', 'ankle'),
      },
      holds: {
        // The chin-high guard must stay inside both view and world arm reach.
        reachLeadMetres: 0.3,
        oneHand: [0.2, -0.2, -0.38],
        twoHand: [0.08, -0.22, -0.42],
        display: [0.14, -0.13, -0.3],
        supportUpright: [0, 0.14, 0],
        supportForward: [0, 0, -0.14],
        // Firearm readiness is separate from en-garde so aiming keeps its authored bore alignment.
        readyPrimary: { offset: [0.025, 0.085, 0.015], rotation: [0.12, -0.08, -0.04] },
        readySupport: { offset: [-0.025, 0.075, 0.01], rotation: [0.1, 0.08, 0.04] },
        // En-garde draws both hands up close to the chin and inward, whether they are fists or holds.
        guardPrimary: { offset: [-0.04, 0.12, 0.05], rotation: [0.12, -0.08, -0.04] },
        guardSupport: { offset: [0.04, 0.1, 0.06], rotation: [0.1, 0.08, 0.04] },
        // A switched-on off-hand item stays visible and directed forward alongside an aimed firearm.
        aimActiveOffHand: { offset: [0, 0.25, 0.02], rotation: [0, 0, 0] },
      },
      // A stance bends each leg at the knee and ankle about these parts and anchors.
      legRig: {
        shin: segment('shin', 'knee'),
        foot: segment('foot', 'ankle'),
      },
      gait: { legSwingDegrees: 12.6, armSwingDegrees: 10 },
      aimPose: {
        torsoShare: { down: 0.1, up: 0.55 },
        neckShare: 0.5,
        torsoLimitDegrees: [45, 80],
        neckLimitDegrees: [35, 35],
        headLimitDegrees: [60, 60],
        stockShoulderOffset: { up: [-0.03, 0.025, 0.02], down: [-0.03, 0.025, -0.06] },
        ads: {
          cameraOffsetLimitMetres: 0.2,
          cameraWallMarginMetres: 0.01,
          ownBodyClipMetres: 0.08,
          ownBodyHide: ['spine', 'neck'],
          stockShoulderLimitMetres: 0.1,
          torsoRollDegrees: 25,
          headRollDegrees: 45,
          neckLengthToleranceFraction: 0.05,
          stockShoulderOffset: [-0.06, 0.03, 0.01],
        },
      },
      lookDownLean: { startPitchDegrees: 60, torsoForwardDegrees: 15 },
      mannequinPlacement: { aheadMetres: 1.2, asideMetres: 1.2 },
      // Collision follows stance, not gaze; fitting the drawing back into that box would detach the aimed head.
      stancePoses: {
        crouching: {
          hipDropMetres: 0.374,
          torsoForwardDegrees: 50,
          legsForwardDegrees: 65,
          kneeBendDegrees: 120,
          ankleDegrees: 55,
          armsForwardDegrees: 70,
          elbowBendDegrees: 115,
          headUpDegrees: 45,
        },
        prone: {
          hipDropMetres: 0.48,
          torsoForwardDegrees: 90,
          legsForwardDegrees: -90,
          kneeBendDegrees: 0,
          ankleDegrees: 0,
          armsForwardDegrees: 0,
          elbowBendDegrees: 0,
          headUpDegrees: 0,
        },
        blendRealSeconds: 0.2,
      },
      proneAdsPose: {
        hipDropMetres: 0.48,
        torsoForwardDegrees: 55,
        legsForwardDegrees: -90,
        kneeBendDegrees: 0,
        ankleDegrees: 0,
        armsForwardDegrees: 0,
        elbowBendDegrees: 0,
        headUpDegrees: 0,
      },
      outfits: {
        police_uniform: outfit('#b39e8f', '#33415e', '#232937', '#121212'),
        special_ops_uniform: outfit('#a99a8b', '#3d4434', '#363b2e', '#17140f'),
        lab_coat: outfit('#b6a597', '#d9d9d1', '#585b62', '#2d2622'),
      },
      // On its back, legs out and a little bent, feet fallen outward and the head tipped back.
      corpsePose: {
        torsoForwardDegrees: -90,
        legsForwardDegrees: 90,
        kneeBendDegrees: 8,
        ankleDegrees: -40,
        armsForwardDegrees: 0,
        elbowBendDegrees: 12,
        headUpDegrees: 10,
      },
    },
  ],
}
