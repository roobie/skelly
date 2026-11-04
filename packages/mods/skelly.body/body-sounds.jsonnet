local audio(files) = ['assets/audio/' + f for f in files];
local numbered(stem, numbers) = audio(['%s-%02d.ogg' % [stem, n] for n in numbers]);
local quiet = { enabled: false, radiusMetres: 1 };
local heard(radius) = { enabled: true, radiusMetres: radius };
local sound(id, description, variants, gain, pitch, gainJitter, interval, category='body', noise=quiet) = {
  id: id, description: description, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: gainJitter, minIntervalSimSeconds: interval,
  category: category, noise: noise,
};
{
  sounds: [
    sound(
      'player_hurt_light', 'Take light damage.',
      numbered('player-hurt-light', [1, 3, 6]), 0.72, [0.96, 1.04], [0.88, 1.12], 0.2, noise=heard(6),
    ),
    sound(
      'player_hurt_heavy', 'Take heavy damage.',
      numbered('player-hurt-heavy', [2, 5, 8]), 0.9, [0.94, 1.06], [0.88, 1.12], 0.35, noise=heard(6),
    ) + { debugHint: "?debug=1: Use the debug panel's damage action to apply damage." },
    sound(
      'player_strain', 'Jump from the ground.',
      numbered('player-strain', [9, 12, 14]), 0.5, [0.96, 1.05], [0.9, 1.1], 0.6, noise=heard(5),
    ),
    sound(
      'player_heartbeat_slow', 'Sprint to lower stamina, then stop and listen as it recovers.',
      audio(['heartbeat-slow-beat.ogg']), 1, [1, 1], [1, 1], 0,
    ),
    sound(
      'player_heartbeat_fast', 'Sprint to lower stamina, then stop and listen as it recovers.',
      audio(['heartbeat-fast-beat.ogg']), 1, [1, 1], [1, 1], 0,
    ),
    sound(
      'player_landing_hard', 'Land after a long drop.',
      numbered('player-landing-hard', [1]), 0.72, [0.94, 1.04], [0.88, 1.12], 0.6,
    ) + { debugHint: "?debug=1: Use the debug panel's Noclip action to reach a ledge." },
    sound(
      'player_block_full',
      'Guard in en-garde with a melee weapon or fists, and fully block a zombie hit.',
      numbered('player-block-full', [1]), 0.9, [1, 1], [0.92, 1.08], 0.08, category='world', noise=heard(8),
    ),
  ],
}
