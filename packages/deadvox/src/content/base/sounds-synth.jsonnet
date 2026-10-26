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
    sound('breath_inhale', 'Holding breath to steady aim starts.', 'body', 0.5, {
      inhale: { _version: 1, _name: 'Inhale', _locked: [], sampleRate: 44100, attack: 0.15, sustain: 0.08, sustainPunch: 0, decay: 0.12, tremoloDepth: 0, tremoloFrequency: 10, frequency: 2500, frequencySweep: 2000, frequencyDeltaSweep: 0, repeatFrequency: 0, frequencyJump1Onset: 33, frequencyJump1Amount: 0, frequencyJump2Onset: 66, frequencyJump2Amount: 0, harmonics: 0, harmonicsFalloff: 0.5, waveform: 'pinknoise', interpolateNoise: true, vibratoDepth: 0, vibratoFrequency: 10, squareDuty: 50, squareDutySweep: 0, flangerOffset: 0, flangerOffsetSweep: 0, bitCrush: 16, bitCrushSweep: 0, lowPassCutoff: 3500, lowPassCutoffSweep: 1500, highPassCutoff: 700, highPassCutoffSweep: 0, compression: 1, normalization: true, amplification: 45 },
    }),
    sound('breath_exhale', 'A held breath is let go.', 'body', 0.5, {
      exhale: { _version: 1, _name: 'Exhale', _locked: [], sampleRate: 44100, attack: 0.03, sustain: 0.1, sustainPunch: 0, decay: 0.25, tremoloDepth: 0, tremoloFrequency: 10, frequency: 3000, frequencySweep: -1500, frequencyDeltaSweep: 0, repeatFrequency: 0, frequencyJump1Onset: 33, frequencyJump1Amount: 0, frequencyJump2Onset: 66, frequencyJump2Amount: 0, harmonics: 0, harmonicsFalloff: 0.5, waveform: 'pinknoise', interpolateNoise: true, vibratoDepth: 0, vibratoFrequency: 10, squareDuty: 50, squareDutySweep: 0, flangerOffset: 0, flangerOffsetSweep: 0, bitCrush: 16, bitCrushSweep: 0, lowPassCutoff: 2800, lowPassCutoffSweep: -1500, highPassCutoff: 450, highPassCutoffSweep: 0, compression: 1, normalization: true, amplification: 45 },
    }),
    sound('breath_gasp', 'A held breath gives out at the winded line.', 'body', 0.6, {
      gasp: { _version: 1, _name: 'Gasp', _locked: [], sampleRate: 44100, attack: 0.01, sustain: 0.05, sustainPunch: 50, decay: 0.14, tremoloDepth: 0, tremoloFrequency: 10, frequency: 4500, frequencySweep: 2500, frequencyDeltaSweep: 0, repeatFrequency: 0, frequencyJump1Onset: 33, frequencyJump1Amount: 0, frequencyJump2Onset: 66, frequencyJump2Amount: 0, harmonics: 0, harmonicsFalloff: 0.5, waveform: 'whitenoise', interpolateNoise: true, vibratoDepth: 0, vibratoFrequency: 10, squareDuty: 50, squareDutySweep: 0, flangerOffset: 0, flangerOffsetSweep: 0, bitCrush: 16, bitCrushSweep: 0, lowPassCutoff: 6500, lowPassCutoffSweep: 0, highPassCutoff: 1100, highPassCutoffSweep: 0, compression: 1, normalization: true, amplification: 55 },
    }),
    sound('door_knock_jfxr', 'Preview only; no game event plays it.', 'world', 0.7, {
      knock: { _version: 1, _name: 'Explosion 11', _locked: [], sampleRate: 44100, attack: 0, sustain: 0.05, sustainPunch: 60, decay: 0.41000000000000003, tremoloDepth: 47, tremoloFrequency: 71, frequency: 1300, frequencySweep: -2000, frequencyDeltaSweep: -4000, repeatFrequency: 0, frequencyJump1Onset: 33, frequencyJump1Amount: 0, frequencyJump2Onset: 66, frequencyJump2Amount: 0, harmonics: 0, harmonicsFalloff: 0.5, waveform: 'pinknoise', interpolateNoise: true, vibratoDepth: 0, vibratoFrequency: 10, squareDuty: 50, squareDutySweep: 0, flangerOffset: 0, flangerOffsetSweep: 0, bitCrush: 16, bitCrushSweep: 0, lowPassCutoff: 22050, lowPassCutoffSweep: 0, highPassCutoff: 0, highPassCutoffSweep: 0, compression: 0.9, normalization: true, amplification: 100 },
    }),
  ],
}
