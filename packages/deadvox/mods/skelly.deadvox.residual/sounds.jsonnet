local audio(files) = ['assets/audio/' + f for f in files];
local numbered(stem, numbers) = audio(['%s-%02d.ogg' % [stem, n] for n in numbers]);
local quiet = { enabled: false, radiusMetres: 1 };
local heard(radius) = { enabled: true, radiusMetres: radius };
local sound(id, description, variants, gain, pitch, gainJitter, interval, category='world', noise=quiet) = {
  id: id, description: description, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: gainJitter, minIntervalSimSeconds: interval,
  category: category, noise: noise,
};

local grassSand = numbered('footstep-grass-sand', std.range(1, 6));
local mud = numbered('footstep-mud', std.range(1, 4));
local stone = numbered('footstep-stone', std.range(1, 6));
local wood = numbered('footstep-wood', std.range(1, 3));
local leaves = numbered('footstep-leaves', [1]);

local spawnShamblers = "?debug=1: Use the debug panel's spawn action to spawn shamblers nearby.";
local shamblerStep(id, surface, variants) =
  sound(
    id,
    'A nearby shambler walks or chases over %s; only the nearest moving shamblers are voiced.' % surface,
    variants, 0.34, [0.68, 0.82], [0.9, 1.1], 0.12,
  ) + { debugHint: spawnShamblers };

// Every zombie type voices the shambler recordings, pitched and levelled per type.
local voiceVariants = {
  idle: numbered('shambler-idle', [1, 2, 3]),
  alert: numbered('shambler-alert', [4, 5, 6]),
  attack: numbered('shambler-attack', [7, 8, 9]),
  hurt: numbered('shambler-hurt', [1]) + numbered('shambler-hit', [5, 6, 7]),
};
local voiceIntervals = { idle: 0.1, alert: 0.25, attack: 0.25, hurt: 0.08 };
local zombieVoices(type, descriptions, debugHint, tuning, scramble={}) = [
  sound(
    type + '_' + action, descriptions[action], voiceVariants[action],
    tuning[action].gain, tuning[action].pitch, tuning[action].gainJitter, voiceIntervals[action],
  ) + { debugHint: debugHint } + scramble
  for action in ['idle', 'alert', 'attack', 'hurt']
];
local spawnType(type) = "?debug=1: Use the debug panel's %s action to spawn %ss nearby." % [type, type];
local zombieEvents(subject) = {
  idle: subject + ' idles nearby.',
  alert: subject + ' notices you.',
  attack: subject + ' reaches you and attacks.',
  hurt: subject + ' is hit by a melee attack.',
};
local shamblerTuning = {
  idle: { gain: 0.45, pitch: [0.95, 1.05], gainJitter: [0.9, 1.1] },
  alert: { gain: 0.72, pitch: [0.94, 1.06], gainJitter: [0.9, 1.12] },
  attack: { gain: 0.8, pitch: [0.94, 1.06], gainJitter: [0.9, 1.1] },
  hurt: { gain: 0.8, pitch: [0.94, 1.06], gainJitter: [0.9, 1.1] },
};

local doorOpen = numbered('door-open', [3]);

{
  soundFamilies: [{ id: 'shambler' }],
  sounds: [
    shamblerStep('shambler_step_grass', 'grass', grassSand),
    shamblerStep('shambler_step_mud', 'dirt or mud', mud),
    shamblerStep('shambler_step_sand', 'sand', grassSand),
    shamblerStep('shambler_step_stone', 'hard ground', stone),
    shamblerStep('shambler_step_wood', 'planks', wood),
    shamblerStep('shambler_step_leaves', 'fabric or carpet', leaves),
  ] + zombieVoices('shambler', {
    idle: 'A shambler idles or strolls within hearing range and groans now and then.',
    alert: 'A shambler notices you and starts investigating.',
    attack: 'A shambler reaches you and attacks.',
    hurt: 'A melee attack hits a shambler.',
  }, spawnShamblers, shamblerTuning)
  + zombieVoices('amalgam', zombieEvents('An amalgam'), spawnType('amalgam'), shamblerTuning)
  + zombieVoices('runner', zombieEvents('A runner'), spawnType('runner'), {
    idle: { gain: 0.42, pitch: [1.18, 1.3], gainJitter: [0.9, 1.1] },
    alert: { gain: 0.72, pitch: [1.15, 1.25], gainJitter: [0.9, 1.12] },
    attack: { gain: 0.8, pitch: [1.12, 1.22], gainJitter: [0.9, 1.12] },
    hurt: { gain: 0.8, pitch: [1.15, 1.25], gainJitter: [0.9, 1.12] },
  })
  + zombieVoices('crawler', zombieEvents('A crawler'), spawnType('crawler'), {
    idle: { gain: 0.52, pitch: [0.68, 0.78], gainJitter: [0.9, 1.1] },
    alert: { gain: 0.62, pitch: [0.7, 0.8], gainJitter: [0.9, 1.12] },
    attack: { gain: 0.7, pitch: [0.65, 0.75], gainJitter: [0.9, 1.12] },
    hurt: { gain: 0.72, pitch: [0.65, 0.75], gainJitter: [0.9, 1.12] },
  })
  // The acid zombie's ring-modulated, raised voice sets it apart by ear from every other zombie.
  + zombieVoices('acid_zombie', zombieEvents('An acid zombie'), spawnType('acid zombie'), {
    idle: { gain: 0.45, pitch: [1.08, 1.16], gainJitter: [0.9, 1.1] },
    alert: { gain: 0.72, pitch: [1.06, 1.14], gainJitter: [0.9, 1.12] },
    attack: { gain: 0.8, pitch: [1.06, 1.14], gainJitter: [0.9, 1.12] },
    hurt: { gain: 0.8, pitch: [1.06, 1.14], gainJitter: [0.9, 1.12] },
  }, { ringMod: { frequencyHz: 70, depth: 0.7 } })
  + [
    sound(
      'door_roller_open', 'Open a closed workshop roller door.',
      doorOpen, 0.65, [0.96, 1.04], [0.9, 1.1], 0.08, noise=heard(60),
    ),
  ],
}
