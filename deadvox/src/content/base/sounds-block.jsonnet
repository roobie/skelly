local block(id, variants, gain, pitch, gainJitter, radius) = {
  id: id, variants: ['assets/audio/' + file for file in variants], gain: gain,
  pitchJitter: pitch, gainJitter: gainJitter, minIntervalSimSeconds: 0.08,
  category: 'world', noise: { enabled: true, radiusMetres: radius },
};
{
  sounds: [
    block('player_block_full', ['melee-hit-0%d.ogg' % n for n in [1, 2, 3, 4]], 0.9, [1.3, 1.4], [0.92, 1.08], 8),
    block('player_block_partial', ['melee_hit_fist-01.ogg'], 0.8, [0.7, 0.8], [0.9, 1.1], 6),
  ],
}
