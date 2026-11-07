{
  sounds: [{
    id: 'player_nope',
    description: 'Try an action the character cannot complete.',
    variants: ['assets/audio/player-nope-01.ogg'],
    gain: 0.5,
    pitchJitter: [1, 1],
    gainJitter: [1, 1],
    minIntervalSimSeconds: 0.75,
    category: 'body',
    noise: { enabled: false, radiusMetres: 1 },
  }],
}
