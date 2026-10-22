{
  sounds: [
    {
      id: 'shotgun_blast',
      variants: ['assets/audio/shotgun-model12-01.ogg', 'assets/audio/shotgun-model12-02.ogg'],
      gain: 0.8,
      lowShelf: { frequencyHz: 240, gainDb: 7 },
      pitchJitter: [0.86, 0.9],
      gainJitter: [1, 1],
      minIntervalSimSeconds: 0,
      category: 'world',
      noise: { enabled: true, radiusMetres: 100 },
    },
    // The Model 12 take is a thin crack; this slowed rifle report under it is the deep, long 12-gauge boom.
    {
      id: 'shotgun_boom',
      variants: ['assets/audio/gunshot-tikka-01.ogg', 'assets/audio/gunshot-tikka-02.ogg'],
      gain: 0.8,
      lowShelf: { frequencyHz: 240, gainDb: 4 },
      pitchJitter: [0.58, 0.64],
      gainJitter: [1, 1],
      minIntervalSimSeconds: 0,
      category: 'world',
      noise: { enabled: false, radiusMetres: 1 },
    },
  ],
}
