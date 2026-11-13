local audio(files) = ['assets/audio/' + f for f in files];
local mechanical(id, description, files, pitch=[0.97, 1.03], gain=0.4) = {
  id: id, description: description, variants: audio(files), gain: gain,
  pitchJitter: pitch, gainJitter: [0.95, 1.05], minIntervalSimSeconds: 0,
  category: 'body', noise: { enabled: false, radiusMetres: 1 },
};
{
  sounds: [
    {
      id: 'revolver_shot', description: 'Fire the revolver on a live round.',
      variants: audio(['gunshot-sw642-01.ogg', 'gunshot-sw642-02.ogg']), gain: 0.9,
      pitchJitter: [0.98, 1.02], gainJitter: [0.95, 1.05], minIntervalSimSeconds: 0,
      category: 'world', noise: { enabled: true, radiusMetres: 85 },
    },
    mechanical(
      'revolver_dry_click', 'Pull the revolver’s trigger on an empty or spent chamber.',
      ['revolver-dry-click-01.ogg'], gain=0.3,
    ),
    mechanical('revolver_crane_open', 'Start a revolver reload: the crane swings out.', ['revolver-crane-open-01.ogg']),
    mechanical(
      'revolver_crane_close', 'Finish or release a revolver reload: the crane closes.', ['revolver-crane-close-01.ogg'],
    ),
    mechanical('revolver_eject', 'Dump the cylinder with the ejector rod.', ['revolver-eject-01.ogg']),
    mechanical(
      'revolver_case_pick', 'Top up the revolver: each spent case is picked out by hand.',
      ['revolver-case-pick-01.ogg'], gain=0.25,
    ),
    mechanical(
      'revolver_round_insert', 'Load one loose round into an open cylinder.',
      ['revolver-round-insert-01.ogg', 'revolver-round-insert-02.ogg'], gain=0.3,
    ),
    mechanical(
      'revolver_hammer_cock', 'Cock the revolver’s hammer for a single-action shot.',
      ['revolver-hammer-cock-01.ogg'], gain=0.3,
    ),
  ],
}
