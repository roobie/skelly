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
        elbowPole: [std.sqrt(0.5), -std.sqrt(0.5), 0],
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
      // Head gear sits on the head and turns with it; carry and armour sit on the torso in the bust's own frame, where
      // their models are authored, and stay drawn in first person as the body does.
      attachmentFrames: {
        head: { part: 'body', pivot: 'head', at: [0, 0.0804, 0], turn: [0, 180, 0], insideView: true },
        torso: frame('body'),
        clothing_body: frame('body'),
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
      lookDownLean: { startPitchDegrees: 60, torsoForwardDegrees: 15 },
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
