{
  figures: [
    {
      id: 'player',
      palette: {
        skin: '#c58f70',
        shirt: '#52677d',
        trousers: '#4a4b55',
      },
      // Stands the bust's eyes at the player's eye height.
      hipHeightMetres: 0.82,
      // Authored parts draw in place of the boxes they name; a box no part names still draws.
      parts: [
        {
          model: 'player_bust',
          draws: ['body', 'head'],
          joints: {
            leftHip: 'hip_left',
            rightHip: 'hip_right',
            leftShoulder: 'shoulder_left',
            rightShoulder: 'shoulder_right',
          },
        },
      ],
      // Each pose keeps the drawn body under its stance's body height in senses.jsonnet.
      stancePoses: {
        crouching: { hipDropMetres: 0.47, torsoForwardDegrees: 35, legsForwardDegrees: 70 },
        prone: { hipDropMetres: 0.48, torsoForwardDegrees: 90, legsForwardDegrees: -90 },
        blendRealSeconds: 0.2,
      },
    },
  ],
}
