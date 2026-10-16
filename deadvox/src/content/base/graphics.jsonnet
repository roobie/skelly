local scale(label, minimum) = { label: label, default: 1, min: minimum, max: 1 };
local toggle(label) = { label: label, default: false, options: [false, true] };

{
  graphics: [{
    id: 'core',
    renderScale: scale('Scene render scale', 0.5),
    bloomScale: scale('Bloom render scale', 0.25),
    smallSunMap: toggle('Smaller sun shadow map'),
    fastCamo: toggle('Fast camouflage pattern'),
    coarseWeathering: toggle('Coarse weathering grid'),
    cachedSurfaceNoise: toggle('Cached surface noise'),
  }],
}
