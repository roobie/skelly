{
  sounds: [
    {
      id: 'furniture_scrape',
      description: 'Lift a crate or other small piece, or set it down.',
      variants: ['assets/audio/door_blocked_close-01.ogg'], gain: 0.7,
      pitchJitter: [0.7, 0.8], gainJitter: [0.9, 1.1], minIntervalSimSeconds: 0.2,
      category: 'world', noise: { enabled: true, radiusMetres: 20 },
    },
    {
      id: 'furniture_drag',
      description: 'Push or drag an oversized piece of furniture across the floor.',
      variants: ['assets/audio/door_blocked_close-01.ogg'], gain: 1,
      pitchJitter: [0.55, 0.65], gainJitter: [0.9, 1.1], minIntervalSimSeconds: 0,
      category: 'world', noise: { enabled: true, radiusMetres: 30 },
    },
    {
      id: 'door_bash',
      description: 'Strike a door or any piece of furniture in melee, or let a chasing zombie bash one in its way.',
      variants: ['assets/audio/door_blocked_close-01.ogg'], gain: 0.9,
      pitchJitter: [0.55, 0.65], gainJitter: [0.9, 1.1], minIntervalSimSeconds: 0,
      category: 'world', noise: { enabled: true, radiusMetres: 40 },
    },
  ],
}
