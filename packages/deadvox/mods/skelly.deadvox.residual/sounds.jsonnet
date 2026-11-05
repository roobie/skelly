{
  sounds: [
    {
      id: 'door_roller_open',
      description: 'Open a closed workshop roller door.',
      variants: ['assets/audio/door-open-03.ogg'],
      gain: 0.65,
      pitchJitter: [0.96, 1.04],
      gainJitter: [0.9, 1.1],
      minIntervalSimSeconds: 0.08,
      category: 'world',
      noise: { enabled: true, radiusMetres: 60 },
    },
  ],
}
