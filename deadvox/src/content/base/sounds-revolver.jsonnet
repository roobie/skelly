local mechanical(id, file, pitch, gain=0.4) = {
  id: id, variants: ['assets/audio/' + file], gain: gain,
  pitchJitter: pitch, gainJitter: [0.95, 1.05], minIntervalSimSeconds: 0,
  category: 'body', noise: { enabled: false, radiusMetres: 1 },
};
{
  sounds: [
    {
      id: 'revolver_shot', variants: ['assets/audio/shotgun-model12-01.ogg'], gain: 0.85,
      pitchJitter: [1.2, 1.25], gainJitter: [0.95, 1.05], minIntervalSimSeconds: 0,
      category: 'world', noise: { enabled: true, radiusMetres: 85 },
    },
    mechanical('revolver_dry_click', 'shotgun-rack-forward.ogg', [1.6, 1.7], 0.22),
    mechanical('revolver_crane_open', 'shotgun-rack-back.ogg', [1.2, 1.3]),
    mechanical('revolver_crane_close', 'shotgun-rack-forward.ogg', [1.3, 1.4]),
    mechanical('revolver_eject', 'shotgun-rack-back.ogg', [1.4, 1.5]),
    mechanical('revolver_case_pick', 'shotgun-insert-01.ogg', [1.2, 1.3], 0.25),
    mechanical('revolver_round_insert', 'shotgun-insert-02.ogg', [1.2, 1.3], 0.3),
    mechanical('revolver_hammer_cock', 'shotgun-rack-back.ogg', [1.5, 1.6], 0.25),
  ],
}
