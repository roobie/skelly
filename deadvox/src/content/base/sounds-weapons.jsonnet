local audio(files) = ['assets/audio/' + f for f in files];
local numbered(stem, count) = audio(['%s-%02d.ogg' % [stem, n] for n in std.range(1, count)]);
local mechanical(id, variants, gain, pitch=[0.97, 1.03], interval=0) = {
  id: id, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: [0.95, 1.05], minIntervalSimSeconds: interval,
  category: 'body', noise: { enabled: false, radiusMetres: 1 },
};
local melee(id, variants, gain, pitch, interval) = {
  id: id, variants: variants, gain: gain,
  pitchJitter: pitch, gainJitter: [0.9, 1.1], minIntervalSimSeconds: interval,
  category: 'world', noise: { enabled: false, radiusMetres: 1 },
};
{
  sounds: [
    {
      id: 'gunshot_tikka', variants: numbered('gunshot-tikka', 2), gain: 1,
      pitchJitter: [0.98, 1.02], gainJitter: [1, 1], minIntervalSimSeconds: 0, voiceCap: 32,
      category: 'world', noise: { enabled: true, radiusMetres: 100 },
    },
    mechanical('rifle_bolt_cycle', numbered('rifle-bolt-cycle', 1), gain=0.5),
    mechanical('firearm_dry_click', numbered('firearm-dry-click', 3), gain=0.3, pitch=[0.95, 1.05], interval=0.15),
    melee('melee_swing_light', numbered('melee-swing-light', 3), gain=0.45, pitch=[0.96, 1.06], interval=0.3),
    melee('melee_swing_heavy', numbered('melee-swing-heavy', 1), gain=0.6, pitch=[0.86, 0.98], interval=0.5),
    melee('melee_hit_metal', numbered('melee-hit-metal', 3), gain=0.35, pitch=[0.95, 1.05], interval=0.08),
  ],
}
