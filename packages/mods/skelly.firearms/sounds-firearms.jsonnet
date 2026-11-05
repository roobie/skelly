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
  ],
}
