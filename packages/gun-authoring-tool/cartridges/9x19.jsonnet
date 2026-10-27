local cite(locator, verbatim=null) = { source: 'saami', locator: 'printed p. 24, cartridge drawing, ' + locator } + if verbatim == null then {} else { verbatim: verbatim };
local measure(value, locator, verbatim) = { value: value, cite: cite(locator, verbatim) };
local unknown = { value: null, cite: null, note: 'Not specified by the governing cartridge drawing.' };
{
  format: 1, kind: 'metallic', id: '9x19', designation: '9×19 mm Parabellum', voxelGrain: 0.002,
  aliases: [{ name: '9mm Luger', cite: cite('drawing title', '9mm LUGER') }],
  sources: {
    saami: {
      body: 'SAAMI', reliability: 'standard',
      title: 'ANSI/SAAMI Z299.3-2022, Centerfire Pistol and Revolver: 9mm Luger cartridge drawing',
      url: 'https://saami.org/wp-content/uploads/2025/05/SAAMI-Z299.3-2022-Centerfire-Pistol-Revolver-Approved-12-13-2022.pdf',
      retrieved: '2026-10-27', revision: 'Drawing revised 06/23/2021',
      sha256: 'e2dad5c77ab57636dcdaa3379150703f4b72420e523f455dba0ff1f8e5d0ca34',
    },
    load: {
      body: 'Wikipedia', reliability: 'secondary', title: '9×19mm Parabellum',
      url: 'https://en.wikipedia.org/wiki/9%C3%9719mm_Parabellum', retrieved: '2026-10-27',
    },
  },
  primarySource: 'saami', relatedTo: [], notes: [],
  case: {
    length: measure(19.15, 'head face to mouth', '.754 - .010 (19.15 - 0.25)') + { tolerance: { minus: 0.25 } },
    bodyStart: measure(5.08, 'body diameter datum', '.200 B (5.08)') + { basic: true },
    rim: {
      diameter: measure(10.01, 'rim diameter', '.394 - .010 (10.01 - 0.25)') + { tolerance: { minus: 0.25 } },
      thickness: measure(1.27, 'rim thickness', '.050 - .010 (1.27 - 0.25)') + { tolerance: { minus: 0.25 } },
    },
    head: { type: 'rimless', extractorGroove: {
      diameter: measure(8.81, 'extractor groove diameter', '.347 - .020 (8.81 - 0.51)') + { tolerance: { minus: 0.51 } },
      width: measure(0.89, 'extractor groove width', '.035 + .010 (0.89 + 0.25)') + { tolerance: { plus: 0.25 } },
    } },
    body: {
      type: 'straight',
      diameterAtHead: measure(9.931, 'diameter at body datum', '.3910 (9.931)') + { tolerance: { minus: 0.18 } },
      diameterAtMouth: measure(9.653, 'mouth diameter', '.3800 (9.653)') + { tolerance: { minus: 0.18 } },
    },
    materials: [], primer: { options: [], diameter: unknown, designation: unknown },
  },
  payload: {
    type: 'bullet',
    diameter: measure(9.03, 'bullet diameter', '.3555 - .0030 (9.030 - 0.076)') + { tolerance: { minus: 0.076 } },
    length: { min: unknown, max: unknown },
    variants: [{ kind: 'fmj', cite: { source: 'load', locator: 'infobox ballistics, Federal FMJ', verbatim: '7.45 g (115 gr) Federal FMJ; 1,180 ft/s (360 m/s)' }, massGrains: { value: 115, cite: { source: 'load', locator: 'infobox ballistics, Federal FMJ', verbatim: '115 gr' } } }],
  },
  overallLength: { max: measure(29.69, 'overall length limits', '1.000 (25.40) MIN – 1.169 (29.69) MAX'), typical: unknown },
}
