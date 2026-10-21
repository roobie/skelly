{
  sounds: [
    {
      id: 'shotgun_blast',
      variants: ['assets/audio/shotgun-model12-01.ogg', 'assets/audio/shotgun-model12-02.ogg'],
      gain: 0.85,
      lowShelf: { frequencyHz: 240, gainDb: 7 },
      pitchJitter: [0.86, 0.9],
      gainJitter: [1, 1],
      minIntervalSimSeconds: 0,
      category: 'world',
      noise: { enabled: true, radiusMetres: 100 },
    },
  ],
}
