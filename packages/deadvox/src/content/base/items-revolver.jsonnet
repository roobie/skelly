(import 'economy.libsonnet').pack({
  items: [
    {
      id: 'revolver_357', name: '.357 revolver', category: 'weapon',
      size: [2, 3], twoHanded: false, model: 'revolver',
      firearm: {
        shotSound: 'revolver_shot', dryFireSound: 'revolver_dry_click', triggerCocks: true,
        recoilKickRadians: 0.035, dispersionRadians: 0.012, pelletSpreadScale: 1,
        handling: {},
        skillZeroHandling: {
          singleShot: { recoilKickScale: 10, recoilRecoveryScale: 0.3, variance: 30 },
          automaticFollowup: { recoilKickScale: 20, recoilRecoveryScale: 0.18, variance: 60 },
        },
        revolver: {
          doubleActionPullSimSeconds: 0.15, doubleActionDispersionRadians: 0.024,
          recoverySimSeconds: 0.3, openSimSeconds: 0.5, ejectSimSeconds: 0.6,
          pickSimSeconds: 0.7, loadSimSeconds: 1, closeSimSeconds: 0.4, cockSimSeconds: 0.3,
          loadPose: {
            pickupEnd: 0.2, approachEnd: 0.7, thumbEnd: 0.84,
            pickupSide: 0.05, pickupBelow: 0.1, pickupBack: 0.1,
            palmBelow: 0, palmBack: 0.055, thumbLift: 0.01, thumbTravel: 0.045,
          },
        },
      },
    },
    {
      id: 'cartridge_357_h_magnum', name: '.357 Magnum round', category: 'ammo',
      weight: 16, size: [1, 1], stack: 50, model: 'round_357_h_magnum',
      ammo: { calibre: '357-magnum', pellets: 1, spreadDegrees: 0, diameterMm: 9.07, damage: 70, impulse: 4, rangeMetres: 100, loadSimSeconds: 0.7, stripSimSeconds: 0.5 },
    },
    {
      id: 'cartridge_box_357_h_magnum', name: '.357 Magnum box', category: 'ammo',
      model: 'cartridge_box_357_h_magnum', size: [2, 2], unpack: { item: 'cartridge_357_h_magnum', count: 50, simSeconds: 1.5 },
    },
    {
      id: 'spent_case_357_h_magnum', name: '.357 Magnum case', category: 'material',
      weight: 6, size: [1, 1], stack: 10000, description: 'A fired brass case.',
      pileDisplay: 'scatter', model: 'case_357_h_magnum',
    },
  ],
})
