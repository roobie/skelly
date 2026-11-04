local block(id, description, variants, gain, pitch, gainJitter, radius) = {
  id: id, description: description, variants: ['assets/audio/' + file for file in variants], gain: gain,
  pitchJitter: pitch, gainJitter: gainJitter, minIntervalSimSeconds: 0.08,
  category: 'world', noise: { enabled: true, radiusMetres: radius },
};
{
  sounds: [
    block(
      'player_block_full',
      'Guard in en-garde with a melee weapon or fists, and fully block a zombie hit.',
      ['player-block-full-01.ogg'], 0.9, [1, 1], [0.92, 1.08], 8,
    ),
    block(
      'player_block_partial',
      'Guard in en-garde, and take a zombie hit the block only partly absorbs.',
      ['melee_hit_fist-01.ogg'], 0.8, [0.7, 0.8], [0.9, 1.1], 6,
    ),
  ],
}
