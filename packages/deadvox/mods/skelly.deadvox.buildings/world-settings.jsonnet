{
  worldSettings: [
    {
      id: 'modern_1980s',
      region: 'A temperate inland region of no single named country: towns and farmland with a mixed industrial edge.',
      era: 'Modern, the 1980s: post-war and late-modern buildings, still lived in and worked in when everything stopped.',
      buildingCulture: 'Brick, rendered block and poured concrete for homes and civic buildings; precast concrete, ' +
                       'blockwork and sheet steel for sheds and works; timber for outbuildings and fittings; ' +
                       'flat or shallow roofs behind parapets and copings.',
      settlementKinds: ['city', 'rural'],
      tags: {
        postwar: 'Built in the reconstruction and expansion of the late 1940s to the early 1960s.',
        late_modern: 'Built from the 1960s to the 1980s, the newest buildings still standing.',
        western_european: 'Drawn from British, Low Countries and French towns and countryside.',
        central_european: 'Drawn from German, Austrian, Czech and Polish towns and countryside.',
        nordic: 'Drawn from Finnish, Swedish and Norwegian building.',
        balkan: 'Drawn from Yugoslav and other Balkan building.',
        mediterranean: 'Drawn from Greek, Cypriot and Italian building.',
      },
      // A town house of the era had an indoor WC and basin; a rural house could rely on a privy or pump outside.
      standards: [{ settlementKind: 'city', usage: 'Residential', serves: ['toilet', 'washing'] }],
    },
  ],
}
