local pistol = import 'gungen/pistol_service.model.json';
(import 'economy.libsonnet').pack({
  items: [
    {
      id: 'pistol_service', name: 'Service Nine', category: 'weapon',
      description: 'Polymer-frame 9×19 mm semi-automatic pistol.',
      model: 'pistol_service', size: [2, 3], twoHanded: true, notLoot: true,
      firearm: {
        handling: { magazine: { removeSimSeconds: 2, insertSimSeconds: 2 } },
        recoilKickRadians: 0.018, dispersionRadians: 0.01, pelletSpreadScale: 1,
        shotSound: 'revolver_shot', dryFireSound: 'firearm_dry_click',
        skillZeroHandling: {
          singleShot: { recoilKickScale: 5, recoilRecoveryScale: 0.5, variance: 20 },
          automaticFollowup: { recoilKickScale: 5, recoilRecoveryScale: 0.5, variance: 20 },
        },
      },
    },
    {
      id: 'magazine_pistol_9', name: '9×19 mm pistol magazine', category: 'ammo',
      weight: 80, size: [1, 2], model: 'magazine_pistol_9', notLoot: true,
    },
    {
      id: 'cartridge_9x19', name: '9×19 mm round', category: 'ammo',
      weight: 12, size: [1, 1], stack: 50, model: 'round_9x19', notLoot: true,
      ammo: { calibre: '9x19', pellets: 1, spreadDegrees: 0, diameterMm: 9.03, damage: 40, impulse: 2.68, rangeMetres: 100, loadSimSeconds: 0.6, stripSimSeconds: 0.5 },
    },
    {
      id: 'spent_case_9x19', name: '9×19 mm case', category: 'material',
      weight: 4, size: [1, 1], stack: 10000, pileDisplay: 'scatter', model: 'case_9x19', notLoot: true,
    },
  ],
  models: [
    pistol + {
      hold: 'forward',
      hands: {
        seat: [0, -0.38, -0.4],
        loweredPitchRadians: 0,
        torsoForwardDegrees: 20,
        elbowBendSide: [0.4, -1, 0.5],
        adsEyeReliefMetres: 0.65,
        viewOffset: [0, 0.22, 0.18],
        adsViewEyeReliefMetres: 0.2,
        firing: { at: [pistol.grip.at[0] - 0.03, pistol.grip.at[1] - 0.04, 0.016], palm: [0, 0, -1], fingers: [0.8660254037844386, 0.5, 0], pose: 'pistolWrap' },
        support: { at: [pistol.grip.at[0] - 0.026, pistol.grip.at[1] - 0.055, -0.04], palm: [0, 0, 1], fingers: [0.8660254037844386, 0.5, 0], pose: 'pistolCup' },
      },
    },
    import 'gungen/magazine_pistol_9.model.json',
    import 'gungen/round_9x19.model.json',
    import 'gungen/case_9x19.model.json',
  ],
})
