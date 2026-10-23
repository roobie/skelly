local scale(label, minimum) = { label: label, default: 1, min: minimum, max: 1 };
local toggle(label, default=false) = { label: label, default: default, options: [false, true] };

{
  graphics: [{
    id: 'core',
    readyRadiusM: 64,
    itemPictureCacheCapacity: 128,
    itemViewer: {
      framing: 1.1,
      startYawDegrees: 45,
      startPitchDegrees: 26,
      pitchLimitDegrees: 85,
      degreesPerPixel: 0.5,
      zoomPerWheelPixel: 0.002,
      zoomMin: 0.5,
      zoomMax: 4,
    },
    mobActors: { maxCorpses: 16 },
    gore: {
      dropletCap: 128,
      splatCap: 256,
      dropletSpawnsPerFrame: 48,
      dripSourceCap: 6,
    },
    renderScale: scale('Scene render scale', 0.5) + {
      adaptive: {
        enabled: true,
        targetRealMs: 15,
        min: 0.5,
        max: 1,
        step: 0.05,
        hysteresisRealMs: 2,
        sampleWindow: 20,
      },
    },
    bloomScale: scale('Bloom render scale', 0.25),
    drugVignette: scale('Painkiller vignette', 0),
    smallSunMap: toggle('Smaller sun shadow map'),
    fastCamo: toggle('Fast camouflage pattern'),
    coarseWeathering: toggle('Coarse weathering grid'),
    cachedSurfaceNoise: toggle('Cached surface noise', true),
  }],
}
