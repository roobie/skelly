{
  sounds: [
    {
      id: 'grenade_blast',
      description: 'A thrown hand grenade goes off when its fuse runs out.',
      variants: ['assets/audio/grenade-blast-01.ogg', 'assets/audio/grenade-blast-02.ogg'],
      gain: 1,
      pitchJitter: [0.95, 1.05],
      gainJitter: [1, 1],
      minIntervalSimSeconds: 0,
      category: 'world',
      noise: { enabled: true, radiusMetres: 300 },
      debugHint: '#{debug:true}: use the spawn menu for a Hand grenade. Pull the pin, take the throwing stance, hold then release to throw, and step back.',
    },
  ],
}
