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
      model: 'rifle_hunting', size: [2, 11], twoHanded: true,
      lightMountSite: { kind: 'strap', at: [0.42, -0.03, 0], turn: [0, 0, 0] },
      firearm: {
        bolt: true, handling: {}, roundLoadSimSeconds: 1.2,
        recoilKickRadians: 0.025, dispersionRadians: 0.006, pelletSpreadScale: 1,
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
        "pelletSpreadScale": 1,
        "pump": true,
        "recoilKickRadians": 0.035,
        "shotSound": "shotgun_blast",
        "shotBodySound": "shotgun_boom",
        "dryFireSound": "shotgun_dry_click",
        "skillZeroHandling": {
          "automaticFollowup": { "recoilKickScale": 20, "recoilRecoveryScale": 0.18, "variance": 60 },
          "singleShot": { "recoilKickScale": 10, "recoilRecoveryScale": 0.35, "variance": 30 }
        }
      },
      "id": "pump_shotgun",
      "lightMountSite": { "kind": "strap", "at": [0.34, -0.045, 0], "turn": [0, 0, 0] },
      "model": "shotgun_pump",
      "name": "Pump shotgun",
      "size": [2, 10],
      "twoHanded": true
    },
    {
      "category": "weapon",
      "description": "Curated 12-gauge hunting-cabin pump from gungen, with a hand-racked action and four-shell tube. No loot table has it; it is available only in debug mode. Runtime pumping/loading is not implemented yet.",
      "id": "debug_shotgun_pump",
      "model": "shotgun_pump",
      "name": "Pump shotgun (debug)",
      "size": [2, 10],
      "twoHanded": true
    },
    {
      "category": "weapon",
      "description": "5.56×45 rifle fed from STANAG magazines.",
      "firearm": magazineHandling {
        "dispersionRadians": 0.012,
        "pelletSpreadScale": 1,
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
      "twoHanded": true
    },
    {
      "category": "weapon",
      "description": "7.62×39 rifle fed from AKM magazines.",
      "firearm": magazineHandling {
        "dispersionRadians": 0.017999999999999999,
        "pelletSpreadScale": 1,
        "recoilKickRadians": 0.012,
        "shotSound": "gunshot",
        "suppressedShotSound": "gunshot_m4_suppressed",
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
      "twoHanded": true
    }
  ],
  // Imports keep the export writer from overwriting authored handling constructors.
  "models": [
    (import 'gungen/rifle_assault.model.json') { gun+: { chargingHandleDegrees: 0 } },
    (import 'gungen/rifle_ak.model.json') { gun+: { chargingHandleDegrees: 90 } },
    import 'gungen/round_7_d_62x39.model.json',
    import 'gungen/case_7_d_62x39.model.json',
    import 'gungen/round_5_d_56x45.model.json',
    import 'gungen/case_5_d_56x45.model.json',
    import 'gungen/round_12_h_gauge_h_00_h_buck.model.json',
    import 'gungen/case_12_h_gauge_h_00_h_buck.model.json',
    import 'gungen/revolver.model.json',
    import 'gungen/round_357_h_magnum.model.json',
    import 'gungen/case_357_h_magnum.model.json',
    import 'gungen/shotgun_pump.model.json',
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
