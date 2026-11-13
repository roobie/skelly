local pistol = import 'packages/skelly-assets/built/skelly.firearms/gungen/pistol_service.model.json';
(import 'item-presentation.libsonnet').pack((import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  items: [
    {
      id: 'pistol_service', name: 'Service Nine', category: 'weapon',
      description: 'Polymer-frame 9×19 mm semi-automatic pistol.',
      model: 'pistol_service', size: [2, 3], twoHanded: true,
      firearm: {
        rackSound: 'rifle_charge',
        handling: { magazine: { removeSimSeconds: 2, insertSimSeconds: 2, changeSound: 'magazine_change' } },
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
      weight: 80, size: [1, 2], model: 'magazine_pistol_9',
    },
    {
      id: 'cartridge_9x19', name: '9×19 mm round', category: 'ammo',
      weight: 12, size: [1, 1], stack: 50, model: 'round_9x19',
      ammo: { damageKind: 'pierce', loadSound: 'magazine_round_insert', stripSound: 'magazine_round_strip', calibre: '9x19', pellets: 1, spreadDegrees: 0, diameterMm: 9.03, damage: 40, impulse: 2.68, rangeMetres: 100, loadSimSeconds: 0.6, stripSimSeconds: 0.5 },
    },
    {
      id: 'cartridge_box_9x19', name: '9×19 mm box', category: 'ammo',
      weight: 625, size: [2, 2], unpack: { item: 'cartridge_9x19', count: 50, simSeconds: 1.5 },
    },
    {
      id: 'spent_case_9x19', name: '9×19 mm case', category: 'material',
      weight: 4, size: [1, 1], stack: 10000, pileDisplay: 'scatter', model: 'case_9x19',
    },
  ],
  models: [
    pistol + {
      hold: 'forward',
      hands: {
        seat: [0, -0.32, -0.3],
        loweredPitchRadians: 0,
        torsoForwardDegrees: 20,
        elbowBendSide: [0.4, -1, 1],
        adsStandoffByPitch: [
          { pitchDegrees: -90, metres: 0.21 },
          { pitchDegrees: -45, metres: 0.24 },
          { pitchDegrees: -15, metres: 0.25 },
          { pitchDegrees: 0, metres: 0.26 },
          { pitchDegrees: 15, metres: 0.25 },
          { pitchDegrees: 45, metres: 0.2 },
          { pitchDegrees: 90, metres: 0.15 },
        ],
        // Held at arm's length, the pistol comes up to the firing eye with the shoulders and head level.
        ads: { cameraOffsetLimitMetres: 0.3, torsoRollDegrees: 0, headRollDegrees: 0 },
        adsViewEyeReliefMetres: 0.2,
        // Model frame: bore along +z, the gun's right at -x.
        firing: { at: [-0.016, pistol.grip.at[1] - 0.04, pistol.grip.at[2] - 0.03], palm: [1, 0, 0], fingers: [0, 0.5, 0.8660254037844386], pose: 'pistolWrap' },
        support: { at: [0.04, pistol.grip.at[1] - 0.051, pistol.grip.at[2] - 0.026], palm: [-1, 0, 0], fingers: [0, 0.5, 0.8660254037844386], pose: 'pistolCup' },
      },
    },
    import 'packages/skelly-assets/built/skelly.firearms/gungen/magazine_pistol_9.model.json',
    import 'packages/skelly-assets/built/skelly.firearms/gungen/round_9x19.model.json',
    import 'packages/skelly-assets/built/skelly.firearms/gungen/case_9x19.model.json',
  ],
}))
