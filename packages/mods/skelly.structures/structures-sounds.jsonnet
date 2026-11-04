local audio(files) = ['assets/audio/' + f for f in files];
local numbered(stem, numbers) = audio(['%s-%02d.ogg' % [stem, n] for n in numbers]);
local quiet = { enabled: false, radiusMetres: 1 };
local heard(radius) = { enabled: true, radiusMetres: radius };
local sound(id, description, variants, gain, pitch, gainJitter, interval, noise=quiet) = {
  id: id, description: description, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: gainJitter, minIntervalSimSeconds: interval,
  category: 'world', noise: noise,
};
local doorBlocked = numbered('door_blocked_close', [1]);
local doorOpen = numbered('door-open', [3]);
{
  sounds: [
    sound(
      'lock_pry', 'Strike a locked door with a crowbar to force its padlock.',
      doorBlocked, 0.8, [0.96, 1.04], [0.9, 1.1], 0, noise=heard(60),
    ),
    sound(
      'lock_hammer', 'Strike a locked door with a sledgehammer to break its lock open.',
      doorBlocked, 1, [0.6, 0.7], [0.9, 1.1], 0, noise=heard(110),
    ),
    sound('door_open', 'Open a closed door within reach.', doorOpen, 0.65, [0.96, 1.04], [0.9, 1.1], 0.08),
    sound('door_close', 'Close an open door within reach.', doorBlocked, 0.75, [0.96, 1.04], [0.9, 1.1], 0.08),
    sound(
      'door_blocked_close', 'Try to close a door while something blocks it.',
      doorBlocked, 0.5, [0.96, 1.04], [0.9, 1.1], 0.2,
    ),
    // The `jfxr` object is a preset exactly as the jfxr editor saves it, so it can be pasted back into the editor to
    // listen and change it (`packages/deadvox/DESIGN.md`, "Assets and credits").
    sound('door_knock_jfxr', 'Preview only; no game event plays it.', [{
      recipe: 'knock',
      jfxr: { _version: 1, _name: 'Explosion 11', _locked: [], sampleRate: 44100, attack: 0, sustain: 0.05, sustainPunch: 60, decay: 0.41000000000000003, tremoloDepth: 47, tremoloFrequency: 71, frequency: 1300, frequencySweep: -2000, frequencyDeltaSweep: -4000, repeatFrequency: 0, frequencyJump1Onset: 33, frequencyJump1Amount: 0, frequencyJump2Onset: 66, frequencyJump2Amount: 0, harmonics: 0, harmonicsFalloff: 0.5, waveform: 'pinknoise', interpolateNoise: true, vibratoDepth: 0, vibratoFrequency: 10, squareDuty: 50, squareDutySweep: 0, flangerOffset: 0, flangerOffsetSweep: 0, bitCrush: 16, bitCrushSweep: 0, lowPassCutoff: 22050, lowPassCutoffSweep: 0, highPassCutoff: 0, highPassCutoffSweep: 0, compression: 0.9, normalization: true, amplification: 100 },
    }], 0.7, [0.95, 1.05], [0.9, 1.05], 0),
  ],
}
