local audio(files) = ['assets/audio/' + f for f in files];
local numbered(stem, numbers) = audio(['%s-%02d.ogg' % [stem, n] for n in numbers]);
local quiet = { enabled: false, radiusMetres: 1 };
local sound(id, description, variants, gain, pitch, gainJitter, interval, category='world') = {
  id: id, description: description, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: gainJitter, minIntervalSimSeconds: interval,
  category: category, noise: quiet,
};
local grassSand = numbered('footstep-grass-sand', std.range(1, 6));
local footstep(id, surface, variants, gain, pitch=[0.96, 1.04]) =
  sound(id, 'Walk, jog or sprint over %s.' % surface, variants, gain, pitch, [0.86, 1.12], 0.2, category='body');
{
  sounds: [
    footstep('footstep_grass', 'grass', grassSand, 0.2),
    footstep('footstep_sand', 'sand', grassSand, 0.22),
    footstep('footstep_mud', 'dirt or mud', numbered('footstep-mud', std.range(1, 4)), 0.24, pitch=[0.94, 1.05]),
    footstep('footstep_stone', 'a hard surface such as stone, concrete, brick or tile', numbered('footstep-stone', std.range(1, 6)), 0.24),
    footstep('footstep_wood', 'planks', numbered('footstep-wood', std.range(1, 3)), 0.22),
    footstep('footstep_leaves', 'fabric or carpet', numbered('footstep-leaves', [1]), 0.18),
    sound(
      'item_drop_wood', 'Drop an item into a pile, or spill it onto the ground.',
      numbered('item_drop_wood', [1, 2]), 0.55, [0.96, 1.04], [0.9, 1.1], 0.08,
    ),
  ],
}
