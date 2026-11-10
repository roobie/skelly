local numbered(stem, numbers) = ['assets/audio/%s-%02d.ogg' % [stem, n] for n in numbers];
local melee(id, description, variants, gain, pitch, gainJitter, interval) = {
  id: id, description: description, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: gainJitter, minIntervalSimSeconds: interval,
  category: 'world', noise: { enabled: false, radiusMetres: 1 },
};
local swingJitter = [0.9, 1.1];
local hitJitter = [0.88, 1.12];
{
  sounds: [
    melee(
      'melee_swing', 'Swing a melee weapon that has no swing sound of its own.',
      numbered('melee_swing', [1]), 0.55, [0.96, 1.04], swingJitter, 0.5,
    ),
    melee(
      'melee_hit', 'Land a weapon melee swing on a shambler.',
      numbered('melee-hit', [1, 2, 3, 4]), 0.85, [0.94, 1.06], hitJitter, 0.08,
    ),
    melee(
      'melee_hit_fist', 'Land a fist swing on a shambler.',
      numbered('melee_hit_fist', [1]), 0.85, [0.94, 1.06], hitJitter, 0.08,
    ),
    melee(
      'melee_swing_light', 'Swing a light blade (knife or machete).',
      numbered('melee-swing-light', [1, 2, 3]), 0.45, [0.96, 1.06], swingJitter, 0.3,
    ),
    melee(
      'melee_swing_heavy', 'Swing a heavy weapon (bat, pipe or crowbar).',
      numbered('melee-swing-heavy', [1]), 0.6, [0.86, 0.98], swingJitter, 0.5,
    ),
    melee(
      'melee_hit_metal', 'Land a swing with a metal weapon (pipe, crowbar or hammer); it layers over the melee hit.',
      numbered('melee-hit-metal', [1, 2, 3]), 0.35, [0.95, 1.05], swingJitter, 0.08,
    ),
  ],
}
