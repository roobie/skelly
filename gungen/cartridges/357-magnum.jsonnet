local cite(locator, verbatim=null) = { source: 'saami', locator: locator } + if verbatim == null then {} else { verbatim: verbatim };
local measure(value, locator, verbatim) = { value: value, cite: cite('printed p. 36, cartridge drawing, ' + locator, verbatim) };
local unknown = { value: null, cite: null, note: 'Not specified by the governing cartridge drawing; no supplemental source has been established.' };
{
  format: 1,
  // A case under 10 mm across needs the fine grain to keep its rim and bullet; the item grain draws an L of blocks.
  voxelGrain: 0.002,
  kind: 'metallic',
  id: '357-magnum',
  designation: '.357 Magnum',
  aliases: [],
  sources: {
    saami: {
      body: 'SAAMI', reliability: 'standard',
      title: 'ANSI/SAAMI Z299.3-2022, Centerfire Pistol and Revolver: 357 Magnum cartridge and chamber drawing',
      url: 'https://saami.org/wp-content/uploads/2025/05/SAAMI-Z299.3-2022-Centerfire-Pistol-Revolver-Approved-12-13-2022.pdf',
      retrieved: '2026-10-16', revision: 'Approved 12-13-2022; drawing revised 07/06/2021',
      sha256: 'e2dad5c77ab57636dcdaa3379150703f4b72420e523f455dba0ff1f8e5d0ca34',
    },
  },
  primarySource: 'saami', relatedTo: [], notes: [],
  case: {
    length: measure(32.77, 'head face to mouth', '1.290 - .020 (32.77 - 0.51)') + { tolerance: { minus: 0.51 } },
    bodyStart: unknown,
    rim: {
      diameter: measure(11.18, 'rim diameter', '.440 - .012 (11.18 - 0.30)') + { tolerance: { minus: 0.30 } },
      thickness: measure(1.52, 'rim thickness', '.060 - .011 (1.52 - 0.28)') + { tolerance: { minus: 0.28 } },
    },
    head: { type: 'rimmed' },
    body: {
      type: 'straight',
      diameterAtHead: measure(9.63, 'cylindrical body diameter', '.379 (9.63) CYLINDRICAL') + { tolerance: { minus: 0.15 } },
      diameterAtMouth: measure(9.63, 'cylindrical body diameter', '.379 (9.63) CYLINDRICAL') + { tolerance: { minus: 0.15 } },
    },
    materials: [],
    primer: { options: [], diameter: unknown, designation: unknown },
  },
  payload: {
    type: 'bullet',
    diameter: measure(9.093, 'jacketed bullet diameter', '.3580 - .0030 (9.093 - 0.076) JACKETED BULLET') + { tolerance: { minus: 0.076 } },
    length: { min: unknown, max: unknown },
    variants: [],
  },
  overallLength: {
    max: measure(40.39, 'overall length limits', '1.405 (35.69) MIN – 1.590 (40.39) MAX'),
    typical: unknown,
  },
}
