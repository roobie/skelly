local outerWallU = 0.25;
{
  defaultCalibre: '308-winchester',
  extractionClearanceGridSteps: 2,
  magazineOuterWallU: outerWallU,
  integralWells: {
    standard: { bodyLengthU: null, sideWallU: outerWallU, floorReserveU: 0.5, topProudU: 0, expectedCapacityByCalibre: {} },
    sporter: { bodyLengthU: 2.75, sideWallU: 0.02, floorReserveU: 0.25, topProudU: 0.125, expectedCapacityByCalibre: { '308-winchester': 4 } },
  },
  cartridges: [
    import '../308-winchester.jsonnet',
    import '../338-lapua-magnum.json',
    import '../357-magnum.jsonnet',
    import '../5.56x45.json',
    import '../7.62x39.json',
    import '../7.62x51.json',
  ],
}
