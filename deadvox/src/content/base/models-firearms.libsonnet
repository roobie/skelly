// Grounded in Crate Club's timed rifle reloads, which drop the old magazine:
// https://crateclub.com/blogs/loadout/how-long-does-it-take-to-reload-an-assault-rifle
// Changing a magazine here stows it instead, so skill 0 sits at the slow end.
local magazineHandling = { handling: { magazine: { removeSimSeconds: 3, insertSimSeconds: 3 } } };
local huntingRifle = import 'gungen/rifle_hunting.model.json';
// The exported support is a contact on the wood; seat the wrist below and behind it so the palm's end meets it without obscuring ADS.
local huntingSupportWristOffset = [-0.02875, -0.0345, 0];

{
  "items": [
    {
      id: 'rifle_hunting', name: 'Hunting rifle', category: 'weapon',
      description: '.308 Winchester bolt-action rifle with an internal magazine.',
      model: 'rifle_hunting', size: [2, 11], twoHanded: true, weight: 3200,
      firearm: {
        bolt: true, handling: {}, roundLoadSimSeconds: 1.2,
        recoilKickRadians: 0.025, dispersionRadians: 0.006,
        shotSound: 'gunshot_tikka', suppressedShotSound: 'gunshot_m4_suppressed',
        dryFireSound: 'firearm_dry_click', boltOpenSound: 'rifle_bolt_open', boltCloseSound: 'rifle_bolt_close',
        skillZeroHandling: {
          singleShot: { recoilKickScale: 6, recoilRecoveryScale: 0.5, variance: 20 },
          automaticFollowup: { recoilKickScale: 12, recoilRecoveryScale: 0.25, variance: 40 },
        },
      },
    },
    {
      "category": "weapon",
      "description": "12-gauge pump shotgun. The tube holds four shells, with one more in the chamber.",
      "firearm": {
        "handling": {},
        "roundLoadSimSeconds": 0.9,
        "dispersionRadians": 0,
        "pump": true,
        "recoilKickRadians": 0.035,
        "shotSound": "gunshot",
        "dryFireSound": "shotgun_dry_click",
        "skillZeroHandling": {
          "automaticFollowup": { "recoilKickScale": 20, "recoilRecoveryScale": 0.18, "variance": 60 },
          "singleShot": { "recoilKickScale": 10, "recoilRecoveryScale": 0.35, "variance": 30 }
        }
      },
      "id": "pump_shotgun",
      "model": "shotgun_pump",
      "name": "Pump shotgun",
      "size": [2, 10],
      "twoHanded": true,
      "weight": 3000
    },
    {
      "category": "weapon",
      "description": "Curated 12-gauge hunting-cabin pump from gungen, with a hand-racked action and four-shell tube. No loot table has it; it is available only in debug mode. Runtime pumping/loading is not implemented yet.",
      "id": "debug_shotgun_pump",
      "model": "shotgun_pump",
      "name": "Pump shotgun (debug)",
      "size": [2, 10],
      "twoHanded": true,
      "weight": 3000
    },
    {
      "category": "weapon",
      "description": "5.56×45 rifle fed from STANAG magazines.",
      "firearm": magazineHandling {
        "dispersionRadians": 0.012,
        "recoilKickRadians": 0.006,
        "shotSound": "gunshot_m4",
        "suppressedShotSound": "gunshot_m4_suppressed",
        "dryFireSound": "firearm_dry_click",
        "skillZeroHandling": {
          "automaticFollowup": { "recoilKickScale": 7, "recoilRecoveryScale": 0.4, "variance": 25 },
          "singleShot": { "recoilKickScale": 3, "recoilRecoveryScale": 0.75, "variance": 15 }
        }
      },
      "id": "rifle_assault",
      "model": "rifle_assault",
      "name": "AR-pattern rifle",
      "size": [2, 9],
      "twoHanded": true,
      "weight": 3500
    },
    {
      "category": "weapon",
      "description": "7.62×39 rifle fed from AKM magazines.",
      "firearm": magazineHandling {
        "dispersionRadians": 0.017999999999999999,
        "recoilKickRadians": 0.012,
        "shotSound": "gunshot",
        "dryFireSound": "firearm_dry_click",
        "skillZeroHandling": {
          "automaticFollowup": { "recoilKickScale": 12, "recoilRecoveryScale": 0.25, "variance": 40 },
          "singleShot": { "recoilKickScale": 6, "recoilRecoveryScale": 0.5, "variance": 20 }
        }
      },
      "id": "rifle_ak",
      "model": "rifle_ak",
      "name": "AK-pattern rifle",
      "size": [2, 9],
      "twoHanded": true,
      "weight": 3500
    }
  ],
  // Imports keep the export writer from overwriting authored handling constructors.
  "models": [
    {
      "anchors": { "muzzle": [0.1832, 0, 0.0501] },
      "file": "assets/models/pistol_compact.glb",
      "grip": { "at": [0.0866, 0, 0.0266], "turn": [-90, 0, 0] },
      "id": "pistol_compact"
    },
    {
      "anchors": { "muzzle": [0.2107, 0, 0.0618] },
      "file": "assets/models/pistol_full.glb",
      "grip": { "at": [0.0885, 0, 0.0312], "turn": [-90, 0, 0] },
      "id": "pistol_full"
    },
    import 'gungen/rifle_assault.model.json',
    import 'gungen/rifle_ak.model.json',
    { "calibre": "7.62x39", "file": "assets/models/round-7_d_62x39.glb", "id": "round_7_d_62x39" },
    { "calibre": "7.62x39", "file": "assets/models/case-7_d_62x39.glb", "id": "case_7_d_62x39" },
    { "calibre": "5.56x45", "file": "assets/models/round-5_d_56x45.glb", "id": "round_5_d_56x45" },
    { "calibre": "5.56x45", "file": "assets/models/case-5_d_56x45.glb", "id": "case_5_d_56x45" },
    {
      "calibre": "12-gauge-00-buck",
      "file": "assets/models/round-12_h_gauge_h_00_h_buck.glb",
      "id": "round_12_h_gauge_h_00_h_buck"
    },
    {
      "calibre": "12-gauge-00-buck",
      "file": "assets/models/case-12_h_gauge_h_00_h_buck.glb",
      "id": "case_12_h_gauge_h_00_h_buck"
    },
    import 'gungen/revolver.model.json',
    import 'gungen/round_357_h_magnum.model.json',
    import 'gungen/case_357_h_magnum.model.json',
    {
      "anchors": { "muzzle": [0.8005, 0.0004, 0.0394] },
      "file": "assets/models/rifle_battle.glb",
      "grip": { "at": [0.3158, 0.0004, -0.0138], "turn": [-90, 0, 0] },
      "id": "rifle_battle"
    },
    {
      "anchors": { "muzzle": [0.7572, -0.0007, 0.0566] },
      "file": "assets/models/shotgun_auto.glb",
      "grip": { "at": [0.2903, -0.0007, 0.0123], "turn": [-90, 0, 0] },
      "id": "shotgun_auto"
    },
    import 'gungen/shotgun_pump.model.json',
    {
      "anchors": { "muzzle": [0.4214, 0.0001, 0.0766] },
      "file": "assets/models/smg_compact.glb",
      "grip": { "at": [0.2868, 0.0001, 0.057], "turn": [-90, 0, 0] },
      "id": "smg_compact"
    },
    {
      "anchors": { "muzzle": [0.5293, 0, 0.0742] },
      "file": "assets/models/smg_full.glb",
      "grip": { "at": [0.2944, 0, 0.0365], "turn": [-90, 0, 0] },
      "id": "smg_full"
    },
    {
      "anchors": { "muzzle": [1.0624, 0.0111, 0.0418] },
      "file": "assets/models/sniper_material.glb",
      "grip": { "at": [0.3172, 0.0111, -0.0181], "turn": [-90, 0, 0] },
      "id": "sniper_material"
    },
    {
      "anchors": { "muzzle": [0.916, 0.0078, 0.0337] },
      "file": "assets/models/sniper_rifle.glb",
      "grip": { "at": [0.296, 0.0078, -0.0179], "turn": [-90, 0, 0] },
      "id": "sniper_rifle"
    },
    huntingRifle + {
      anchors: huntingRifle.anchors + {
        support_wrist: [huntingRifle.anchors.support[i] + huntingSupportWristOffset[i] for i in std.range(0, 2)],
      },
    },
    import 'gungen/round_308_h_winchester.model.json',
    import 'gungen/case_308_h_winchester.model.json',
    import 'gungen/optic_hunting_3_9x.model.json',
  ]
}
