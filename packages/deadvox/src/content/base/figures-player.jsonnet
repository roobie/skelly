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
      },
      // Each limb is mirror-symmetric, so one model hangs on either side.
      limbs: {
        leftArm: limb('player_arm', 'shoulder'),
        rightArm: limb('player_arm', 'shoulder'),
        leftLeg: limb('player_leg', 'hip'),
        rightLeg: limb('player_leg', 'hip'),
      },
      // The first-person view turns each arm part about its joint. A fist closes hard; a hand on a grip leaves room
      // for the handle; a hand on a screen's back lies nearly flat.
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
        },
      },
      gait: { legSwingDegrees: 12.6, armSwingDegrees: 10 },
      // Each pose keeps the drawn body under its stance's body height in senses.jsonnet.
      stancePoses: {
        crouching: { hipDropMetres: 0.47, torsoForwardDegrees: 35, legsForwardDegrees: 70 },
        prone: { hipDropMetres: 0.48, torsoForwardDegrees: 90, legsForwardDegrees: -90 },
        blendRealSeconds: 0.2,
      },
    },
  ],
}
