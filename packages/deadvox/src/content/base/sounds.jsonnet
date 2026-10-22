local audio(files) = ['assets/audio/' + f for f in files];
local numbered(stem, numbers) = audio(['%s-%02d.ogg' % [stem, n] for n in numbers]);
local quiet = { enabled: false, radiusMetres: 1 };
local heard(radius) = { enabled: true, radiusMetres: radius };
local sound(id, description, variants, gain, pitch, gainJitter, interval, category='world', noise=quiet) = {
  id: id, description: description, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: gainJitter, minIntervalSimSeconds: interval,
  category: category, noise: noise,
};
local handling(id, description, variants, gain, pitch) =
  sound(id, description, variants, gain, pitch, [0.95, 1.05], 0, category='body');
local firearm(id, description, variants, pitch, radius) =
  sound(id, description, variants, 1, pitch, [1, 1], 0, noise=heard(radius)) + { voiceCap: 32 };

local grassSand = numbered('footstep-grass-sand', std.range(1, 6));
local mud = numbered('footstep-mud', std.range(1, 4));
local stone = numbered('footstep-stone', std.range(1, 6));
local wood = numbered('footstep-wood', std.range(1, 3));
local leaves = numbered('footstep-leaves', [1]);
local footstep(id, surface, variants, gain, pitch=[0.96, 1.04]) =
  sound(id, 'Walk, jog or sprint over %s.' % surface, variants, gain, pitch, [0.86, 1.12], 0.2, category='body');

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
local zombieVoices(type, descriptions, debugHint, tuning) = [
  sound(
    type + '_' + action, descriptions[action], voiceVariants[action],
    tuning[action].gain, tuning[action].pitch, tuning[action].gainJitter, voiceIntervals[action],
  ) + { debugHint: debugHint }
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

local doorBlocked = numbered('door_blocked_close', [1]);
local doorOpen = numbered('door-open', [3]);
local rackBack = audio(['shotgun-rack-back.ogg']);
local shellInsert = numbered('shotgun-insert', [1, 2]);

{
  sounds: [
    handling('shotgun_rack_back', 'Rack the held pump shotgun: its backward hand stroke.', rackBack, 0.65, [1, 1]),
    handling(
      'shotgun_rack_forward', 'A pump shotgun rack reaches its forward stroke.',
      audio(['shotgun-rack-forward.ogg']), 0.65, [1, 1],
    ),
    handling(
      'shotgun_insert', 'Load a loose shell into the held pump shotgun; each shell is its own handling job.',
      shellInsert, 0.5, [0.98, 1.02],
    ),
    handling(
      'magazine_round_insert',
      'Load a loose matching cartridge into the magazine in hand; each round is its own handling job.',
      shellInsert, 0.35, [1.12, 1.2],
    ),
    handling(
      'magazine_round_strip', 'Strip the top round from a loaded magazine in hand.',
      shellInsert, 0.3, [1.25, 1.35],
    ),
    handling(
      'magazine_change', 'Change, insert or remove the magazine of the AR or AK in hand.',
      numbered('magazine-clipload', [1, 2]), 0.45, [0.97, 1.03],
    ),
    handling('rifle_charge', 'Work the charging handle of the AR or AK in hand.', rackBack, 0.5, [1.15, 1.2]),
    sound(
      'shotgun_hull_drop', 'A fired pump shotgun hull lands after it is ejected.',
      numbered('shotgun-hull', [1, 2, 3]), 0.35, [0.97, 1.03], [0.9, 1.1], 0,
    ),
    sound(
      'grenade_blast', 'A thrown hand grenade goes off when its fuse runs out.',
      numbered('grenade-blast', [1, 2]), 1, [0.95, 1.05], [1, 1], 0, noise=heard(300),
    ) + {
      debugHint: '?debug=1&loadout=grenade: pull the pin, take the throwing stance, hold then release to throw, and step back.',
    },
    sound(
      'player_hurt_light', 'Take light damage.',
      numbered('player-hurt-light', [1, 3, 6]), 0.72, [0.96, 1.04], [0.88, 1.12], 0.2, category='body', noise=heard(6),
    ),
    sound(
      'player_nope', 'Try an action the character cannot complete.',
      numbered('player-nope', [1]), 0.5, [1, 1], [1, 1], 0.75, category='body',
    ),
    sound(
      'player_hurt_heavy', 'Take heavy damage.',
      numbered('player-hurt-heavy', [2, 5, 8]), 0.9, [0.94, 1.06], [0.88, 1.12], 0.35, category='body', noise=heard(6),
    ) + { debugHint: "?debug=1: Use the debug panel's damage action to apply damage." },
    sound(
      'player_strain', 'Jump from the ground.',
      numbered('player-strain', [9, 12, 14]), 0.5, [0.96, 1.05], [0.9, 1.1], 0.6, category='body', noise=heard(5),
    ),
    sound(
      'player_landing_hard', 'Land after a long drop.',
      numbered('player-landing-hard', [1]), 0.72, [0.94, 1.04], [0.88, 1.12], 0.6, category='body',
    ) + { debugHint: "?debug=1: Use the debug panel's Noclip action to reach a ledge." },
    footstep('footstep_grass', 'grass', grassSand, 0.2),
    footstep('footstep_sand', 'sand', grassSand, 0.22),
    footstep('footstep_mud', 'dirt or mud', mud, 0.24, pitch=[0.94, 1.05]),
    footstep('footstep_stone', 'a hard surface such as stone, concrete, brick or tile', stone, 0.24),
    footstep('footstep_wood', 'planks', wood, 0.22),
    footstep('footstep_leaves', 'fabric or carpet', leaves, 0.18),
    shamblerStep('shambler_step_grass', 'grass', grassSand),
    shamblerStep('shambler_step_mud', 'dirt or mud', mud),
    shamblerStep('shambler_step_sand', 'sand', grassSand),
    shamblerStep('shambler_step_stone', 'hard ground', stone),
    shamblerStep('shambler_step_wood', 'planks', wood),
    shamblerStep('shambler_step_leaves', 'fabric or carpet', leaves),
    sound(
      'melee_swing', 'Swing a melee weapon that has no swing sound of its own.',
      numbered('melee_swing', [1]), 0.55, [0.96, 1.04], [0.9, 1.1], 0.5,
    ),
    sound(
      'melee_hit', 'Land a weapon melee swing on a shambler.',
      numbered('melee-hit', [1, 2, 3, 4]), 0.85, [0.94, 1.06], [0.88, 1.12], 0.08,
    ),
    sound(
      'melee_hit_fist', 'Land a fist swing on a shambler.',
      numbered('melee_hit_fist', [1]), 0.85, [0.94, 1.06], [0.88, 1.12], 0.08,
    ),
    firearm(
      'gunshot',
      'Fire the AK-pattern rifle, or a firearm without a shot sound of its own. A fitted suppressor shortens how far it is heard, and wear lengthens it again.',
      numbered('gunshot-akm', [1, 2]), [1, 1], 100,
    ),
    firearm(
      'gunshot_pbs1_reference', 'Preview only: suppressed AKM alternatives no game event plays.',
      numbered('gunshot-akm-pbs1', [1, 2]), [1, 1], 50,
    ),
    firearm(
      'gunshot_m4', 'Fire the AR-pattern rifle without a suppressor fitted.',
      numbered('gunshot-ar15', [1, 2]), [0.98, 1.02], 100,
    ),
    firearm(
      'gunshot_m4_suppressed', 'Fire the AR-pattern rifle with a real suppressor fitted.',
      numbered('gunshot-m4-suppressed', [1]), [1, 1], 100,
    ),
    sound(
      'item_drop_wood', 'Drop an item into a pile, or spill it onto the ground.',
      numbered('item_drop_wood', [1, 2]), 0.55, [0.96, 1.04], [0.9, 1.1], 0.08,
    ),
    sound(
      'pouch_take', 'Take an item out of a pocket on a worn item.',
      numbered('pouch_take', [1]), 0.3, [0.96, 1.04], [0.9, 1.1], 0.1,
    ),
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
  + [
    sound(
      'lock_pry', 'Strike a locked door with a crowbar to force its padlock.',
      doorBlocked, 0.8, [0.96, 1.04], [0.9, 1.1], 0, noise=heard(60),
    ),
    sound('door_open', 'Open a closed door within reach.', doorOpen, 0.65, [0.96, 1.04], [0.9, 1.1], 0.08),
    sound(
      'door_roller_open', 'Open a closed workshop roller door.',
      doorOpen, 0.65, [0.96, 1.04], [0.9, 1.1], 0.08, noise=heard(60),
    ),
    sound('door_close', 'Close an open door within reach.', doorBlocked, 0.75, [0.96, 1.04], [0.9, 1.1], 0.08),
    sound(
      'door_blocked_close', 'Try to close a door while something blocks it.',
      doorBlocked, 0.5, [0.96, 1.04], [0.9, 1.1], 0.2,
    ),
  ],
}
