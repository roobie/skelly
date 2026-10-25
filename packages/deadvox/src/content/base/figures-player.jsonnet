local limb(model, joint) = { model: model, joint: joint };
local segment(part, pivot) = { part: part, pivot: pivot };
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
        head: segment('head', 'head'),
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
      // A stance bends each leg at the knee and ankle about these parts and anchors.
      legRig: {
        shin: segment('shin', 'knee'),
        foot: segment('foot', 'ankle'),
      },
      gait: { legSwingDegrees: 12.6, armSwingDegrees: 10 },
      // Each pose keeps the drawn body under its stance's body height in player.jsonnet. The crouch reads as a crouch:
      // knees bent, feet flat under the hips, torso leaning forward, arms hanging low in front and head up looking
      // ahead. Its ankle turns the foot back to level, and its hip drop puts the soles on the ground.
      stancePoses: {
        crouching: {
          hipDropMetres: 0.374,
          torsoForwardDegrees: 50,
          legsForwardDegrees: 65,
          kneeBendDegrees: 120,
          ankleDegrees: 55,
          armsForwardDegrees: 60,
          headUpDegrees: 45,
        },
        prone: {
          hipDropMetres: 0.48,
          torsoForwardDegrees: 90,
          legsForwardDegrees: -90,
          kneeBendDegrees: 0,
          ankleDegrees: 0,
          armsForwardDegrees: 0,
          headUpDegrees: 0,
        },
        blendRealSeconds: 0.2,
      },
    },
  ],
}
