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
      attachmentFrames: {
        head: { part: 'body', pivot: 'head', at: [0, 0.0804, 0], turn: [0, 180, 0], insideView: true },
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
        // Relaxed hands hang below the view; en-garde returns them at the same authored rate on either side.
        emptyHands: {
          loweredOffset: [0, -0.1, 0.08],
          transitionTimeConstantRealSeconds: 0.2,
        },
      },
      // A stance bends each leg at the knee and ankle about these parts and anchors.
      legRig: {
        shin: segment('shin', 'knee'),
        foot: segment('foot', 'ankle'),
      },
      gait: { legSwingDegrees: 12.6, armSwingDegrees: 10 },
      mannequinPlacement: { aheadMetres: 1.2, asideMetres: 1.2 },
      // Each pose keeps the drawn body under its stance's body height in player.jsonnet. The crouch reads as a crouch:
      // knees bent, feet flat under the hips, torso leaning forward, head up looking ahead and arms in a guard for
      // balance, elbows bent with the forearms raised in front. Its ankle turns the foot back to level, and its hip
      // drop puts the soles on the ground.
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
      // Each dead human wears one of these over the player's models (`DESIGN.md`, "Dead humans"); dead skin is pale.
      outfits: {
        police_uniform: {
          skin: '#b39e8f', shirt: '#33415e', pants: '#232937', shoe: '#121212',
        },
        special_ops_uniform: {
          skin: '#a99a8b', shirt: '#3d4434', pants: '#363b2e', shoe: '#17140f',
        },
        lab_coat: {
          skin: '#b6a597', shirt: '#d9d9d1', pants: '#585b62', shoe: '#2d2622',
        },
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
