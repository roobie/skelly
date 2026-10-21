local scale(label, minimum) = { label: label, default: 1, min: minimum, max: 1 };
local toggle(label, default=false) = { label: label, default: default, options: [false, true] };

{
  graphics: [{
    id: 'core',
    readyRadiusM: 64,
    actorLod: {
      enabled: true,
      enterFarM: 40,
      returnNearM: 36,
      families: {
        shambler: { eligible: true, edgeLengthM: 0.25 },
        runner: { eligible: true, edgeLengthM: 0.25 },
        brute: { eligible: true, edgeLengthM: 0.25 },
        crawler: { eligible: false, reason: 'Crawler alignment is an owned follow-up to d573.' },
        amalgam: { eligible: false, reason: 'Compound bodies and carved tissue require a separate representation.' },
      },
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
