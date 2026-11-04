local audio(files) = ['assets/audio/' + f for f in files];
local numbered(stem, count) = audio(['%s-%02d.ogg' % [stem, n] for n in std.range(1, count)]);
local mechanical(id, description, variants, gain, pitch=[0.97, 1.03], interval=0) = {
  id: id, description: description, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: [0.95, 1.05], minIntervalSimSeconds: interval,
  category: 'body', noise: { enabled: false, radiusMetres: 1 },
};
local melee(id, description, variants, gain, pitch, interval) = {
  id: id, description: description, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: [0.9, 1.1], minIntervalSimSeconds: interval,
  category: 'world', noise: { enabled: false, radiusMetres: 1 },
};
{
  sounds: [
    {
      id: 'gunshot_tikka', description: 'Fire the bolt-action hunting rifle.', variants: numbered('gunshot-tikka', 2), gain: 1,
      pitchJitter: [0.98, 1.02], gainJitter: [1, 1], minIntervalSimSeconds: 0, voiceCap: 32,
      category: 'world', noise: { enabled: true, radiusMetres: 100 },
    },
    mechanical(
      'rifle_bolt_open',
      'Open the hunting rifle’s bolt to load loose cartridges, or at the start of a full cycle.',
      numbered('rifle-bolt-open', 1), gain=0.5,
    ),
    mechanical(
      'rifle_bolt_close',
      'Close the hunting rifle’s bolt after loading, or at the end of a full cycle.',
      numbered('rifle-bolt-close', 1), gain=0.5,
    ),
    mechanical(
      'firearm_dry_click',
      'Pull the trigger of a magazine gun or the hunting rifle on an empty chamber; it clicks once, then stays silent until the action is worked.',
      numbered('firearm-dry-click', 3), gain=0.3, pitch=[0.95, 1.05], interval=0.15,
    ),
    mechanical(
      'shotgun_dry_click',
      'Pull the pump shotgun’s trigger on an empty chamber; it clicks once, then stays silent until it is racked.',
      numbered('shotgun-dry-click', 1), gain=0.35, pitch=[0.95, 1.05], interval=0.15,
    ),
    melee(
      'melee_swing_light', 'Swing a light blade (knife or machete).',
      numbered('melee-swing-light', 3), gain=0.45, pitch=[0.96, 1.06], interval=0.3,
    ),
    melee(
      'melee_swing_heavy', 'Swing a heavy weapon (bat, pipe or crowbar).',
      numbered('melee-swing-heavy', 1), gain=0.6, pitch=[0.86, 0.98], interval=0.5,
    ),
    melee(
      'melee_hit_metal', 'Land a swing with a metal weapon (pipe, crowbar or hammer); it layers over the melee hit.',
      numbered('melee-hit-metal', 3), gain=0.35, pitch=[0.95, 1.05], interval=0.08,
    ),
  ],
}
