{
  sounds: [
    {
      id: 'pouch_take',
      description: 'Take an item out of a pocket on a worn item.',
      variants: ['assets/audio/pouch_take-01.ogg'],
      gain: 0.3,
      pitchJitter: [0.96, 1.04],
      gainJitter: [0.9, 1.1],
      minIntervalSimSeconds: 0.1,
      category: 'world',
      noise: { enabled: false, radiusMetres: 1 },
    },
  ],
}
