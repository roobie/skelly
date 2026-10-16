{
  defaultCalibre: '308-winchester',
  extractionClearanceGridSteps: 2,
  magazineWallGridSteps: 1,
  magazineReserveGridSteps: 2,
  cartridges: [
    import '../308-winchester.jsonnet',
    import '../338-lapua-magnum.json',
    import '../357-magnum.jsonnet',
    import '../5.56x45.json',
    import '../7.62x39.json',
    import '../7.62x51.json',
  ],
}
