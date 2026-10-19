{
  sounds: [
    {
      id: 'furniture_scrape', variants: ['assets/audio/door_blocked_close-01.ogg'], gain: 0.7,
      pitchJitter: [0.7, 0.8], gainJitter: [0.9, 1.1], minIntervalSimSeconds: 0.2,
      category: 'world', noise: { enabled: true, radiusMetres: 20 },
    },
  ],
}
