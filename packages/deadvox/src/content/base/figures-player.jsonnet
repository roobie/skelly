local limb(model, joint) = { model: model, joint: joint };
{
  figures: [
    {
      id: 'player',
      palette: {
        skin: '#c58f70',
        shirt: '#52677d',
        trousers: '#4a4b55',
      },
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
