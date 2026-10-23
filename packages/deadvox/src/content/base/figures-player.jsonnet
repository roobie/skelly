{
  figures: [
    {
      id: 'player',
      palette: {
        skin: '#c58f70',
        shirt: '#52677d',
        trousers: '#4a4b55',
      },
      // Each pose keeps the drawn body under its stance's body height in senses.jsonnet.
      stancePoses: {
        crouching: { hipDropMetres: 0.45, torsoForwardDegrees: 35, legsForwardDegrees: 70 },
        prone: { hipDropMetres: 0.48, torsoForwardDegrees: 90, legsForwardDegrees: -90 },
        blendRealSeconds: 0.2,
      },
    },
  ],
}
