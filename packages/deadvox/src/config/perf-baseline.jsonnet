{
  viewport: { width: 1672, height: 832 },
  deviceScaleFactor: 1.5,
  repeats: 3,
  warmFrames: 300,
  sampleFrames: 240,
  timeoutMs: 240000,
  queryDrainMs: 30000,
  modes: ['whole', 'passes'],
  routes: [
    {
      id: 'sky',
      path: '/?site=playtest&seed=1&radius=48&debug=1&at=430,523,-90&skyRoute=1&time=13:00&cam=430,21.50,523,-90,0,0',
      driver: 'sky',
    },
    {
      id: 'gauntlet-horde',
      path: '/?site=gauntlet&seed=73&debug=1&radius=96&time=12:00',
      driver: 'orbit',
      spawnCount: 40,
      liftMetres: 3,
      yawAmplitudeDegrees: 35,
      yawCycles: 1,
      cpuProfile: true,
    },
    {
      id: 'interior',
      path: '/?site=stair_demo&seed=1&radius=32&debug=1&time=12:00&cam=56,21.5,57.5,-90,0,0',
      driver: 'orbit',
      yawAmplitudeDegrees: 35,
      yawCycles: 1,
    },
  ],
}
