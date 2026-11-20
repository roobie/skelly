// Each `jfxr` object is a preset exactly as the jfxr editor saves it, so it can be pasted
// back into the editor to listen and change it (`packages/deadvox/DESIGN.md`, "Assets and credits").
{
  sounds: [
    {
      id: 'plant_module_hum',
      description: 'A plant module hums for as long as it produces.',
      // A running module loops this, so it has no attack or decay, and its tone and tremolo complete whole cycles
      // over its length: the loop seam does not click.
      variants: [{
        recipe: 'hum',
        jfxr: { _version: 1, _name: 'Hum', _locked: [], sampleRate: 44100, attack: 0, sustain: 1, sustainPunch: 0, decay: 0, tremoloDepth: 20, tremoloFrequency: 3, frequency: 100, frequencySweep: 0, frequencyDeltaSweep: 0, repeatFrequency: 0, frequencyJump1Onset: 33, frequencyJump1Amount: 0, frequencyJump2Onset: 66, frequencyJump2Amount: 0, harmonics: 4, harmonicsFalloff: 0.6, waveform: 'sine', interpolateNoise: true, vibratoDepth: 0, vibratoFrequency: 10, squareDuty: 50, squareDutySweep: 0, flangerOffset: 0, flangerOffsetSweep: 0, bitCrush: 16, bitCrushSweep: 0, lowPassCutoff: 22050, lowPassCutoffSweep: 0, highPassCutoff: 0, highPassCutoffSweep: 0, compression: 1, normalization: true, amplification: 50 },
      }],
      gain: 0.5,
      pitchJitter: [1, 1],
      gainJitter: [1, 1],
      minIntervalSimSeconds: 0,
      category: 'world',
      // Actors hear the module by its power device's hum radius, not by this voice.
      noise: { enabled: false, radiusMetres: 1 },
    },
  ],
}
