local cartridge = import '../../cartridges/9x19.jsonnet';
{
  strokeBasis: 'derived from cartridge overall length',
  feedClearanceMm: 10.5,
  strokeMm: cartridge.overallLength.max.value + self.feedClearanceMm,
  rpm: 450,
  holdOpenOnEmpty: true,
  ejectAt: 0.7,
  ejectDirection: [0.12, 0.24, 0.96],
  rearwardSpeedMetresPerSecond: 3.75,
  dwellSeconds: 0.006,
  triggerMode: 'semi',
}
