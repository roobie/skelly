// Each `jfxr` object is a preset exactly as the jfxr editor saves it, so it can be pasted
// back into the editor to listen and change it (`DESIGN.md`, "Assets and credits").
local sound(id, description, category, gain, presets) = {
  id: id,
  description: description,
  variants: [{ recipe: recipe, jfxr: presets[recipe] } for recipe in std.objectFields(presets)],
  gain: gain,
  pitchJitter: [0.95, 1.05],
  gainJitter: [0.9, 1.05],
  minIntervalSimSeconds: 0,
  category: category,
  noise: { enabled: false, radiusMetres: 1 },
};
{
  sounds: [
    sound('door_knock_jfxr', 'Preview only; no game event plays it.', 'world', 0.7, {
      knock: { _version: 1, _name: 'Explosion 11', _locked: [], sampleRate: 44100, attack: 0, sustain: 0.05, sustainPunch: 60, decay: 0.41000000000000003, tremoloDepth: 47, tremoloFrequency: 71, frequency: 1300, frequencySweep: -2000, frequencyDeltaSweep: -4000, repeatFrequency: 0, frequencyJump1Onset: 33, frequencyJump1Amount: 0, frequencyJump2Onset: 66, frequencyJump2Amount: 0, harmonics: 0, harmonicsFalloff: 0.5, waveform: 'pinknoise', interpolateNoise: true, vibratoDepth: 0, vibratoFrequency: 10, squareDuty: 50, squareDutySweep: 0, flangerOffset: 0, flangerOffsetSweep: 0, bitCrush: 16, bitCrushSweep: 0, lowPassCutoff: 22050, lowPassCutoffSweep: 0, highPassCutoff: 0, highPassCutoffSweep: 0, compression: 0.9, normalization: true, amplification: 100 },
    }),
  ],
}
