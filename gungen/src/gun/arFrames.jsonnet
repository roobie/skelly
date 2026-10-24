// The AR receiver frames and the clearance method they share. Each frame names its rank and embeds the sourced
// cartridge it is derived from, so a new frame needs no code change. A frame measure that follows its
// cartridge clears the cartridge measure (times `multiplier`) plus `clearanceUnits`, then rounds up to `snap`:
// `grid`, or `half-grid` where the parts build halves the measure, so each half stays on the grid; `none` keeps
// the fit envelope exact. A receiver estimate is read from a side-profile photo scaled by a published length of the
// rifle pictured (`scale`), in gun units, and stays an estimate that needs visual review. `magazineProfile` is the
// box magazine the frame's well takes, so a design in the frame's calibre seats that magazine.
local derivation(measure, clearanceUnits, snap, description, multiplier=null) =
  { measure: measure, clearanceUnits: clearanceUnits, snap: snap, description: description }
  + (if multiplier == null then {} else { multiplier: multiplier });
{
  derivations: {
    fitMaximumOverallLength: derivation('maximumOverallLengthMm', 0.25, 'none', 'maximum cartridge overall length'),
    fitMaximumHeadDiameter: derivation('maximumHeadDiameterMm', 0.25, 'none', 'maximum rim and case-head diameter'),
    carrierLength: derivation('caseLengthMm', 0.1, 'half-grid', 'case length; bolt-face clearance'),
    carrierTravel: derivation('caseLengthMm', 2.5, 'grid', 'case length; the stroke margin clears the ejected case'),
    ejectionPortLength: derivation(
      'caseLengthMm', 1, 'half-grid', 'case length; end clearance leaves the case free of the port edges'
    ),
    ejectionPortHeight: derivation(
      'maximumHeadDiameterMm', 1, 'half-grid', 'case-head diameter; aperture allowance clears the carrier and case'
    ),
    magwellOpeningLength: derivation(
      'maximumOverallLengthMm', 1, 'half-grid', 'maximum cartridge overall length; insertion clearance for the magazine'
    ),
    magwellOpeningWidth: derivation(
      'maximumHeadDiameterMm', 1.25, 'half-grid', 'case-head diameter across the double column; wall and insertion allowance', 2
    ),
    barrelExtensionLength: derivation(
      'caseLengthMm', 0.25, 'grid', 'case length; estimated extension depth is half the case length with end clearance', 0.5
    ),
    barrelExtensionDiameter: derivation(
      'maximumHeadDiameterMm', 1, 'half-grid', 'maximum case-head diameter; diametral wall and running allowance'
    ),
  },
  frames: [
    {
      id: 'small',
      rank: 0,
      cartridge: import '../../cartridges/5.56x45.json',
      receiver: {
        photo: 'https://commons.wikimedia.org/wiki/File:PEO_M4_Carbine_RAS_M68_CCO.png',
        scale: "the rifle's published overall length in https://en.wikipedia.org/wiki/M4_carbine",
        lengthUnits: 16,
        heightUnits: 5,
        belowBoreUnits: 2.5,
      },
      magazineProfile: 'stanag-straight',
      // U.S. Army TM 9-1005-319-10, M16/M4 technical manual: cyclic rate 700–950 rounds/minute.
      cyclicRpm: 800,
    },
    {
      id: 'large',
      rank: 1,
      cartridge: import '../../cartridges/7.62x51.json',
      // Traced from BR's reference photo, a Knight's Armament SR-25 E2 with a 20 in barrel (its lower reads "RIFLE
      // 7.62 MM / SR 25 / KNIGHT'S MANUFACTURING CO"), registered on the bore and the receiver's front face. Scale:
      // the 1,195 px rifle at the listing's 43.5 in extended length, 0.9246 mm/px (12.44 px/u); the 1.148 in
      // receiver extension (32 px) and the 20 in barrel agree within 1%. The upper runs 252 px; the rail top sits
      // 2.85u above the bore and the upper's parting line 1.81u below, each to the nearest grid step, except that the
      // bottom sits 2u below so the barrel extension's seat keeps its 0.5u wall. The closed dust cover spans
      // -9.65u to -1.41u (8.24u); the port takes 8u, longer than the 7.62×51 case needs, and keeps the derived height,
      // since the 2u cover is shorter than the case head's clearance.
      receiver: {
        photo: 'https://viranomainen.fi/tiedostot/1/kuva/tuote/1200/12757212.jpg',
        scale: 'the 43.5 in extended overall length listed for the SR-25 E2 20 in, https://operationparts.com/?p=175806',
        lengthUnits: 20.25,
        heightUnits: 4.75,
        belowBoreUnits: 2,
        ejectionPortLengthUnits: 8,
        // The cover's centre, so the port stays on it at -9.5u to -1.5u whatever the carrier's length.
        ejectionPortCenterX: -5.5,
      },
      // Hidden behind the closed dust cover in the photo, so sized from a real AR-10 class carrier: about 1.0-1.1 in
      // across, full diameter for about 4.5 in behind its gas key. Its 2.5u (1.13 in) height is the port's, centred
      // 0.25u above the bore, so the carrier fills the window; a taller carrier would need a taller port. Its 10u
      // (4.5 in) body runs past the port's rear.
      carrier: { bottomU: -1, topU: 1.5, lengthU: 10 },
      // See magazines.jsonnet.
      magazineProfile: 'sr25-straight',
      // Traced from the same photo, to the nearest grid step: the magazine's centre at -5u, the grip's top front 1.55u
      // ahead of its mount at -13.9u, the guard's bottom at -7.8u (the finger space ends one 0.25u wall above it), and
      // the flared magwell's lip at -6.4u in front and -7.8u behind. Behind the upper the photo's end plate and castle
      // nut make one face with the lower's rear; the model has neither, so the lower ends flush with the receiver.
      lower: {
        rearX: -20.25,
        wellCenterX: -5,
        gripX: -15.5,
        housingFrontBottomU: -6.5,
        housingRearBottomU: -7.75,
        // Not visible in a side photo: flush with the receiver's sides.
        halfWidthU: 2,
        // The trigger group, traced from the same photo. The guard's opening runs -13.4u to -8.71u and -5.0u to -7.7u
        // with its bottom bar's underside near -8u; the lower's pinned body fills the space above it. The opening's
        // front stops at -9.25u, 0.54u short of the photo's, because the magazine's well clearance and the housing's
        // and guard's 0.25u walls sit in front of it. The finger space keeps the guard's 0.5u clearance each side.
        // The blade curves forward from the opening's top at -12.2u to its tip at -11.7u, -7.35u, about 0.4u thick,
        // traced in two convex segments; a real trigger is about 0.25 in (0.5u) wide.
        trigger: {
          fingerRearX: -13,
          fingerFrontX: -9.75,
          fingerTopU: -5,
          fingerBottomU: -7.75,
          guardWallU: 0.25,
          housingRearWallU: 0.25,
          blade: {
            segments: [
              [[-12.5, -6], [-12, -6], [-11.75, -5], [-12.25, -5]],
              [[-12, -7.25], [-11.75, -7.25], [-11.75, -7], [-12, -6], [-12.5, -6]],
            ],
            halfWidthU: 0.25,
          },
        },
      },
      // The free-float rail ends 34.57u ahead of the receiver (34u, so its 2u slot pitch divides it) with its top
      // rail flush with the receiver's at 2.75u (2.85u traced).
      freeFloatHandguard: { lengthU: 34, topU: 2.75 },
      // https://en.wikipedia.org/wiki/AR-10, infobox: rate of fire 700 rounds/min.
      cyclicRpm: 700,
    },
  ],
}
