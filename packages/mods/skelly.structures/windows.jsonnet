local preset = (import 'structures-sounds.jsonnet').sounds[5].variants[0].jfxr;
local glassSound(id, description, sustain, decay, radius) = {
  id: id,
  description: description,
  variants: [{ recipe: id, jfxr: preset + {
    _name: description, sustain: sustain, decay: decay,
    frequency: 6200, frequencySweep: -2400, frequencyDeltaSweep: 0,
    tremoloDepth: 0, tremoloFrequency: 0, highPassCutoff: 1700,
    waveform: 'whitenoise',
  } }],
  gain: 0.7, pitchJitter: [0.94, 1.06], gainJitter: [0.9, 1.1],
  minIntervalSimSeconds: 0,
  category: 'world', noise: { enabled: true, radiusMetres: radius },
};
local window = {
  id: 'clear_hinged_window',
  name: 'Hinged window',
  size: [4, 5, 1],
  color: '#8c7659',
  material: 'wood',
  breach: { minimumStrength: 3, durability: 90 },
  ruin: { debris: [{ item: 'wood_offcut', count: 3 }] },
  window: {
    inside: 'back', hinge: 'low',
    thicknessBlocks: 0.16, frameWidthBlocks: 0.12, sashWidthBlocks: 0.1,
    passageLeewayMetres: 0.01,
    openTurnRadians: -std.pi / 2,
    handlingSimSeconds: 0.5,
    initialPane: 'intact', initialLatched: true,
    minimumForce: 0.5, breakForce: 5, forceTaken: 5,
    shards: { item: 'glass_shards', count: 4 },
    impactSound: 'glass_impact', shatterSound: 'glass_shatter',
    glass: { color: '#b8d9de', opacity: 0.22, thicknessBlocks: 0.012 },
    hardwareColor: '#a8976a', hardwareSizeBlocks: 0.08, remnantHeightBlocks: 0.16,
  },
};
local broken(clear, id, name) = clear + { id: id, name: name, window+: { initialPane: 'missing' } };
// A house bay is about a metre and a half square, set above a sill; the hinged window above is
// shopfront sized.
local casement = window + { id: 'clear_casement_window', name: 'Casement window', size: [3, 3, 1] };
{
  furniture: [
    window,
    broken(window, 'broken_hinged_window', 'Broken hinged window'),
    casement,
    broken(casement, 'broken_casement_window', 'Broken casement window'),
  ],
  sounds: [
    glassSound('glass_impact', 'Strike a glass pane.', 0.015, 0.07, 18),
    glassSound('glass_shatter', 'Shatter a glass pane.', 0.09, 0.5, 45),
  ],
}
