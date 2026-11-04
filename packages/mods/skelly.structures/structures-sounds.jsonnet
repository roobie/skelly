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
  ],
}
