// The AR receiver frames and the clearance method they share. Each frame names its rank and embeds the sourced
// cartridge it is derived from, so a new frame needs no code change. A frame measure that follows its
// cartridge clears the cartridge measure (times `multiplier`) plus `clearanceUnits`, then rounds up to `snap`:
// `grid`, or `half-grid` where the parts build halves the measure, so each half stays on the grid; `none` keeps
// the fit envelope exact. A receiver estimate is read from a side-profile photo scaled by the rifle's published
// overall length, in gun units, and stays an estimate that needs visual review.
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
        overallLength: 'https://en.wikipedia.org/wiki/M4_carbine',
        lengthUnits: 16,
        heightUnits: 5,
      },
      // U.S. Army TM 9-1005-319-10, M16/M4 technical manual: cyclic rate 700–950 rounds/minute.
      cyclicRpm: 800,
    },
    {
      id: 'large',
      rank: 1,
      cartridge: import '../../cartridges/7.62x51.json',
      receiver: {
        photo: "https://commons.wikimedia.org/wiki/File:AR10_Armalite_vue_d'ensemble_noBG.png",
        overallLength: 'https://en.wikipedia.org/wiki/AR-10',
        lengthUnits: 21.5,
        heightUnits: 5.5,
      },
      // https://en.wikipedia.org/wiki/AR-10, infobox: rate of fire 700 rounds/min.
      cyclicRpm: 700,
    },
  ],
}
