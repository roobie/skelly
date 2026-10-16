{
  "items": [
    {
      "category": "weapon",
      "description": "12-gauge pump shotgun. The tube holds four shells, with one more in the chamber.",
      "firearm": {
        "dispersionRadians": 0,
        "pump": true,
        "recoilKickRadians": 0.035,
        "shotSound": "gunshot",
        "skillZeroHandling": {
          "automaticFollowup": { "recoilKickScale": 20, "recoilRecoveryScale": 0.18, "variance": 60 },
          "singleShot": { "recoilKickScale": 10, "recoilRecoveryScale": 0.35, "variance": 30 }
        }
      },
      "id": "pump_shotgun",
      "model": "shotgun_pump",
      "name": "Pump shotgun",
      "size": [2, 8],
      "twoHanded": true,
      "weight": 3000
    },
    {
      "category": "weapon",
      "description": "Curated 12-gauge hunting-cabin pump from gungen, with a hand-racked action and four-shell tube. No loot table has it; it is available only in debug mode. Runtime pumping/loading is not implemented yet.",
      "id": "debug_shotgun_pump",
      "model": "shotgun_pump",
      "name": "Pump shotgun (debug)",
      "size": [1, 5],
      "twoHanded": true,
      "weight": 3000
    },
    {
      "category": "weapon",
      "description": "5.56×45 rifle fed from STANAG magazines.",
      "firearm": {
        "dispersionRadians": 0.012,
        "recoilKickRadians": 0.006,
        "shotSound": "gunshot_m4",
        "suppressedShotSound": "gunshot_m4_suppressed",
        "skillZeroHandling": {
          "automaticFollowup": { "recoilKickScale": 7, "recoilRecoveryScale": 0.4, "variance": 25 },
          "singleShot": { "recoilKickScale": 3, "recoilRecoveryScale": 0.75, "variance": 15 }
        }
      },
      "id": "rifle_assault",
      "model": "rifle_assault",
      "name": "AR-pattern rifle",
      "size": [1, 5],
      "twoHanded": true,
      "weight": 3500
    },
    {
      "category": "weapon",
      "description": "7.62×39 rifle fed from AKM magazines.",
      "firearm": {
        "dispersionRadians": 0.018,
        "recoilKickRadians": 0.012,
        "shotSound": "gunshot",
        "skillZeroHandling": {
          "automaticFollowup": { "recoilKickScale": 12, "recoilRecoveryScale": 0.25, "variance": 40 },
          "singleShot": { "recoilKickScale": 6, "recoilRecoveryScale": 0.5, "variance": 20 }
        }
      },
      "id": "rifle_ak",
      "model": "rifle_ak",
      "name": "AK-pattern rifle",
      "size": [1, 5],
      "twoHanded": true,
      "weight": 3500
    }
  ],
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
    {
      "id": "rifle_assault",
      "file": "assets/models/rifle_assault.glb",
      "grip": { "at": [-0.158906, -0.084252, 0], "turn": [0, 0, 0] },
      "sight": {
        "kind": "optic",
        "eye": [-0.184, 0.06325, 0],
        "direction": [1, 0, 0],
        "up": [0, 1, -1.2246467991473532e-16],
        "eyeReliefMetres": 0.08625,
        "ocularDiameterMetres": 0.031625
      },
      "muzzleDirection": [1, 0, 1.2246467991473532e-16],
      "anchors": {
        "support": [0.177675, -0.01725, 0],
        "muzzle": [0.414, 0, 0],
        "ejection": [-0.048875, 0.002875, 0.023]
      },
      "calibre": "5.56x45",
      "action": {
        "parts": {
          "carrier": {
            "node": "bolt-carrier:bolt-carrier",
            "axis": [-1, 0, -1.2246467991473532e-16],
            "strokeMetres": 0.07475,
            "modes": ["fire", "hand"]
          },
          "handle": {
            "node": "charging-handle:ar-charging-handle",
            "axis": [-1, 0, -1.2246467991473532e-16],
            "strokeMetres": 0.07475,
            "modes": ["hand"]
          }
        },
        "fire": {
          "durationSimSeconds": 0.075,
          "rearwardSimSeconds": 0.019933333333333334,
          "dwellSimSeconds": 0.006,
          "forwardSimSeconds": 0.04616585577328428
        },
        "hand": {
          "durationSimSeconds": 1.6961658557732842,
          "rearwardSimSeconds": 0.65,
          "dwellSimSeconds": 0.3,
          "forwardSimSeconds": 0.04616585577328428
        },
        "ejectAt": 0.76,
        "ejectDirection": [-0.16063576942357702, 0.16063576942357702, 0.9738543521304357],
        "holdOpen": true,
        "roundsPerSimMinute": 800
      },
      "attachments": [
        {
          "id": "optic-lpvo-1-6x",
          "kind": "optic",
          "massKg": 0.16156919783654183,
          "mount": "rail-top",
          "properties": {
            "reticleKind": "crosshair",
            "magnification": { "min": 1, "max": 6 },
            "railSpanNotches": { "minOffset": -3, "maxOffset": 3 }
          },
          "sight": {
            "kind": "optic",
            "eye": [-0.11499999999999999, 0.0345, 0],
            "direction": [1, 0, 0],
            "up": [0, 1, 0],
            "eyeReliefMetres": 0.08625,
            "ocularDiameterMetres": 0.031625
          },
          "mountFrame": { "normal": [0, -1, 0], "up": [1, 0, 0] },
          "node": "sight:sight",
          "mountedAt": "receiver.rail.3"
        }
      ],
      "attachmentSlots": [
        {
          "id": "receiver.rail.0",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 0,
          "position": [-0.138, 0.02875, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.1",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 1,
          "position": [-0.115, 0.02875, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.2",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 2,
          "position": [-0.092, 0.02875, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.3",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 3,
          "position": [-0.069, 0.02875, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.4",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 4,
          "position": [-0.046, 0.02875, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.5",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 5,
          "position": [-0.023, 0.02875, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.6",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 6,
          "position": [0, 0.02875, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "barrel.muzzle.0",
          "mount": "muzzle",
          "position": [0.414, 0, 0],
          "direction": [1, 0, 1.2246467991473532e-16],
          "up": [0, 1, 0]
        },
        {
          "id": "handguard.rail.0",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 0,
          "position": [0.023, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.1",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 1,
          "position": [0.046, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.2",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 2,
          "position": [0.069, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.3",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 3,
          "position": [0.092, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.4",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 4,
          "position": [0.115, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.5",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 5,
          "position": [0.138, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.6",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 6,
          "position": [0.161, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.7",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 7,
          "position": [0.184, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.8",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 8,
          "position": [0.207, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.9",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 9,
          "position": [0.23, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.10",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 10,
          "position": [0.253, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.11",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 11,
          "position": [0.276, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.0",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 0,
          "position": [0.023, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.1",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 1,
          "position": [0.046, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.2",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 2,
          "position": [0.069, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.3",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 3,
          "position": [0.092, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.4",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 4,
          "position": [0.115, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.5",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 5,
          "position": [0.138, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.6",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 6,
          "position": [0.161, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.7",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 7,
          "position": [0.184, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.8",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 8,
          "position": [0.207, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.9",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 9,
          "position": [0.23, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.10",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 10,
          "position": [0.253, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.11",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 11,
          "position": [0.276, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.0",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 0,
          "position": [0.023, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.1",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 1,
          "position": [0.046, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.2",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 2,
          "position": [0.069, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.3",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 3,
          "position": [0.092, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.4",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 4,
          "position": [0.115, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.5",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 5,
          "position": [0.138, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.6",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 6,
          "position": [0.161, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.7",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 7,
          "position": [0.184, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.8",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 8,
          "position": [0.207, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.9",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 9,
          "position": [0.23, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.10",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 10,
          "position": [0.253, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.11",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 11,
          "position": [0.276, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        }
      ],
      "compatibility": {
        "receiver.rail.0": [],
        "receiver.rail.1": ["optic-mini-reflex", "optic-tube-dot"],
        "receiver.rail.2": ["optic-mini-reflex", "optic-tube-dot", "optic-holographic"],
        "receiver.rail.3": [
          "optic-mini-reflex",
          "optic-tube-dot",
          "optic-holographic",
          "optic-fixed-prism-4x",
          "optic-high-mag-5-25x",
          "optic-digital-thermal"
        ],
        "receiver.rail.4": ["optic-mini-reflex", "optic-tube-dot", "optic-holographic"],
        "receiver.rail.5": ["optic-mini-reflex", "optic-tube-dot"],
        "receiver.rail.6": [],
        "barrel.muzzle.0": ["real-suppressor", "improvised-suppressor"],
        "handguard.rail.0": [],
        "handguard.rail.1": [],
        "handguard.rail.2": [],
        "handguard.rail.3": [],
        "handguard.rail.4": [],
        "handguard.rail.5": [],
        "handguard.rail.6": [],
        "handguard.rail.7": [],
        "handguard.rail.8": [],
        "handguard.rail.9": [],
        "handguard.rail.10": [],
        "handguard.rail.11": [],
        "handguard.rail-bottom.0": ["foregrip"],
        "handguard.rail-bottom.1": ["foregrip"],
        "handguard.rail-bottom.2": ["foregrip"],
        "handguard.rail-bottom.3": ["foregrip"],
        "handguard.rail-bottom.4": ["foregrip"],
        "handguard.rail-bottom.5": ["foregrip"],
        "handguard.rail-bottom.6": ["foregrip"],
        "handguard.rail-bottom.7": ["foregrip"],
        "handguard.rail-bottom.8": ["foregrip"],
        "handguard.rail-bottom.9": ["foregrip"],
        "handguard.rail-bottom.10": ["foregrip"],
        "handguard.rail-bottom.11": ["foregrip"],
        "handguard.rail-side.0": ["tactical-flashlight-mount"],
        "handguard.rail-side.1": ["tactical-flashlight-mount"],
        "handguard.rail-side.2": ["tactical-flashlight-mount"],
        "handguard.rail-side.3": ["tactical-flashlight-mount"],
        "handguard.rail-side.4": ["tactical-flashlight-mount"],
        "handguard.rail-side.5": ["tactical-flashlight-mount"],
        "handguard.rail-side.6": ["tactical-flashlight-mount"],
        "handguard.rail-side.7": ["tactical-flashlight-mount"],
        "handguard.rail-side.8": ["tactical-flashlight-mount"],
        "handguard.rail-side.9": ["tactical-flashlight-mount"],
        "handguard.rail-side.10": ["tactical-flashlight-mount"],
        "handguard.rail-side.11": ["tactical-flashlight-mount"]
      },
      "compatibilityPairs": [
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.0", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.1", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.10", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.11", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.2", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.3", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.4", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.5", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.6", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.7", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.8", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.9", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.1", "optic-tube-dot"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.2", "optic-holographic"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.2", "optic-tube-dot"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-holographic"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-tube-dot"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.4", "optic-holographic"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.4", "optic-tube-dot"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.5", "optic-tube-dot"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.0", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.1", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.10", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.11", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.2", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.3", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.4", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.5", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.6", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.7", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.8", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.9", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.1", "optic-tube-dot"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.2", "optic-holographic"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.2", "optic-tube-dot"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-holographic"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-tube-dot"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.4", "optic-holographic"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.4", "optic-tube-dot"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.1", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.10", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.11", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.10", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.11", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.11", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.1", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.10", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.11", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.10", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.11", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.11", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.5", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.5", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.5", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.5", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.6", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.6", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.6", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.7", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.7", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [
          ["handguard.rail-side.8", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-mini-reflex"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.1", "optic-tube-dot"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-holographic"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-mini-reflex"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.2", "optic-tube-dot"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-fixed-prism-4x"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-holographic"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-lpvo-1-6x"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-mini-reflex"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-tube-dot"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-holographic"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.4", "optic-tube-dot"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.5", "optic-tube-dot"]],
        [["receiver.rail.1", "optic-mini-reflex"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["receiver.rail.1", "optic-mini-reflex"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["receiver.rail.1", "optic-tube-dot"], ["receiver.rail.4", "optic-mini-reflex"]],
        [["receiver.rail.1", "optic-tube-dot"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["receiver.rail.2", "optic-mini-reflex"], ["receiver.rail.5", "optic-mini-reflex"]],
        [["receiver.rail.2", "optic-tube-dot"], ["receiver.rail.5", "optic-mini-reflex"]]
      ],
      "slots": { "magazine": { "node": "magazine:magazine", "at": [-0.048875, -0.020125, 0], "turn": [0, 0, 0] } },
      "chargingHandleDegrees": 0
    },
    {
      "id": "rifle_ak",
      "file": "assets/models/rifle_ak.glb",
      "grip": { "at": [-0.222156, -0.067002, 0], "turn": [0, 0, 0] },
      "sight": {
        "kind": "iron",
        "eye": [-0.02875, 0.048875, 0],
        "direction": [1, 0, 1.1498592083597285e-16],
        "up": [1.408171398987851e-32, 1, -1.2246467991473532e-16],
        "eyeReliefMetres": 0.253
      },
      "muzzleDirection": [1, 0, 2.4492935982947064e-16],
      "anchors": {
        "support": [0.09315, -0.020125, 0],
        "muzzle": [0.391, 0, 0],
        "ejection": [-0.048875, 0.0115, 0.023]
      },
      "calibre": "7.62x39",
      "action": {
        "parts": {
          "carrier": {
            "node": "bolt-carrier:bolt-carrier",
            "axis": [-1, 0, -1.2246467991473532e-16],
            "strokeMetres": 0.07475,
            "modes": ["fire", "hand"]
          }
        },
        "fire": {
          "durationSimSeconds": 0.1,
          "rearwardSimSeconds": 0.019933333333333334,
          "dwellSimSeconds": 0.006,
          "forwardSimSeconds": 0.04616585577328428
        },
        "hand": {
          "durationSimSeconds": 1.6961658557732842,
          "rearwardSimSeconds": 0.65,
          "dwellSimSeconds": 0.3,
          "forwardSimSeconds": 0.04616585577328428
        },
        "ejectAt": 0.72,
        "ejectDirection": [0.3396605091514848, 0.1998002995008734, 0.9190813777040178],
        "holdOpen": false,
        "roundsPerSimMinute": 600
      },
      "attachments": [],
      "attachmentSlots": [
        {
          "id": "barrel.muzzle.0",
          "mount": "muzzle",
          "position": [0.368, 0, 0],
          "direction": [1, 0, 1.2246467991473532e-16],
          "up": [0, 1, 0]
        },
        {
          "id": "muzzle-device.muzzle.0",
          "mount": "muzzle",
          "position": [0.391, 0, 0],
          "direction": [1, 0, 2.4492935982947064e-16],
          "up": [0, 1, 0]
        },
        {
          "id": "handguard.rail.0",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 0,
          "position": [0.023, 0.04025, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.1",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 1,
          "position": [0.046, 0.04025, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.2",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 2,
          "position": [0.069, 0.04025, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.3",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 3,
          "position": [0.092, 0.04025, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.4",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 4,
          "position": [0.115, 0.04025, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.5",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 5,
          "position": [0.138, 0.04025, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.0",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 0,
          "position": [0.023, -0.04025, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.1",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 1,
          "position": [0.046, -0.04025, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.2",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 2,
          "position": [0.069, -0.04025, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.3",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 3,
          "position": [0.092, -0.04025, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.4",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 4,
          "position": [0.115, -0.04025, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.5",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 5,
          "position": [0.138, -0.04025, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.0",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 0,
          "position": [0.023, 0, 0.01725],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.1",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 1,
          "position": [0.046, 0, 0.01725],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.2",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 2,
          "position": [0.069, 0, 0.01725],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.3",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 3,
          "position": [0.092, 0, 0.01725],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.4",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 4,
          "position": [0.115, 0, 0.01725],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.5",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 5,
          "position": [0.138, 0, 0.01725],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        }
      ],
      "compatibility": {
        "barrel.muzzle.0": [],
        "muzzle-device.muzzle.0": [],
        "handguard.rail.0": [],
        "handguard.rail.1": [],
        "handguard.rail.2": [],
        "handguard.rail.3": [],
        "handguard.rail.4": [],
        "handguard.rail.5": [],
        "handguard.rail-bottom.0": ["foregrip"],
        "handguard.rail-bottom.1": ["foregrip"],
        "handguard.rail-bottom.2": ["foregrip"],
        "handguard.rail-bottom.3": ["foregrip"],
        "handguard.rail-bottom.4": ["foregrip"],
        "handguard.rail-bottom.5": ["foregrip"],
        "handguard.rail-side.0": ["tactical-flashlight-mount"],
        "handguard.rail-side.1": ["tactical-flashlight-mount"],
        "handguard.rail-side.2": ["tactical-flashlight-mount"],
        "handguard.rail-side.3": ["tactical-flashlight-mount"],
        "handguard.rail-side.4": ["tactical-flashlight-mount"],
        "handguard.rail-side.5": ["tactical-flashlight-mount"]
      },
      "compatibilityPairs": [
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.1", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.1", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["handguard.rail-side.5", "tactical-flashlight-mount"]]
      ],
      "slots": { "magazine": { "node": "magazine:magazine", "at": [-0.08625, -0.02875, 0], "turn": [0, 0, 0] } },
      "chargingHandleDegrees": 90
    },
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
    {
      "id": "shotgun_pump",
      "file": "assets/models/shotgun_pump.glb",
      "grip": { "at": [-0.215625, -0.037375, 0], "turn": [0, 0, 0] },
      "sight": {
        "kind": "iron",
        "eye": [0.4485, 0.02875, 0],
        "direction": [1, 0, 9.269426048794883e-17],
        "up": [1.1351772940589751e-32, 1, -1.2246467991473532e-16],
        "eyeReliefMetres": 0.520375
      },
      "muzzleDirection": [1, 0, 1.2246467991473532e-16],
      "anchors": {
        "support": [0.231438, -0.043051, 0.0276],
        "muzzle": [0.45425, 0, 0],
        "ejection": [-0.033062, 0, 0.01725],
        "loading_port": [-0.0575, -0.04025, 0]
      },
      "calibre": "12-gauge-00-buck",
      "action": {
        "parts": {
          "carrier": {
            "node": "bolt-carrier:bolt-carrier",
            "axis": [-1, 0, -1.2246467991473532e-16],
            "strokeMetres": 0.06325,
            "modes": ["hand"]
          },
          "forend": {
            "node": "forend:forend",
            "axis": [-1, 0, -2.4492935982947064e-16],
            "strokeMetres": 0.06325,
            "modes": ["hand"]
          }
        },
        "hand": {
          "durationSimSeconds": 1.5,
          "rearwardSimSeconds": 0.5,
          "dwellSimSeconds": 0.15,
          "forwardSimSeconds": 0.5
        },
        "ejectAt": 0.76,
        "ejectDirection": [0.12038585308576918, 0.24077170617153837, 0.9630868246861535],
        "holdOpen": false
      },
      "internalMagazine": { "capacity": 4 },
      "attachments": [],
      "attachmentSlots": [
        {
          "id": "barrel.muzzle.0",
          "mount": "muzzle",
          "position": [0.45425, 0, 0],
          "direction": [1, 0, 1.2246467991473532e-16],
          "up": [0, 1, 0]
        }
      ],
      "compatibility": { "barrel.muzzle.0": [] },
      "compatibilityPairs": []
    },
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
    {
      "id": "rifle_hunting",
      "file": "assets/models/rifle_hunting.glb",
      "grip": { "at": [-0.2185, -0.037375, 0], "turn": [0, 0, 0] },
      "sight": {
        "kind": "iron",
        "eye": [-0.17825, 0.04025, 0],
        "direction": [1, 0, 0],
        "up": [0, 1, -1.2246467991473532e-16],
        "eyeReliefMetres": 0.046
      },
      "muzzleDirection": [1, 0, 1.2246467991473532e-16],
      "anchors": {
        "support": [0.207, -0.01725, 0],
        "muzzle": [0.529, 0, 0],
        "ejection": [-0.069, 0.014375, 0.023],
        "loading_port": [-0.084812, 0.02875, 0]
      },
      "calibre": "308-winchester",
      "action": {
        "parts": {
          "carrier": {
            "node": "bolt-carrier:bolt-carrier",
            "axis": [-1, 0, -1.2246467991473532e-16],
            "strokeMetres": 0.077625,
            "modes": ["hand"],
            "turn": {
              "pivot": [-0.069, 0.014375, 0],
              "axis": [-1, 0, -1.2246467991473532e-16],
              "angleRadians": 1.0471975511965976
            }
          },
          "arm": {
            "node": "bolt-handle-arm:bolt-handle-arm",
            "axis": [-1, 8.437635310577427e-17, -3.885780586188048e-16],
            "strokeMetres": 0.077625,
            "modes": ["hand"],
            "turn": {
              "pivot": [-0.069, 0.014375, 0],
              "axis": [-1, 8.437635310577427e-17, -3.885780586188048e-16],
              "angleRadians": 1.0471975511965976
            }
          },
          "knob": {
            "node": "bolt-handle-knob:bolt-handle-knob",
            "axis": [-1, 8.437635310577427e-17, -5.66553889764798e-16],
            "strokeMetres": 0.077625,
            "modes": ["hand"],
            "turn": {
              "pivot": [-0.069, 0.014375, 0],
              "axis": [-1, 8.437635310577427e-17, -5.66553889764798e-16],
              "angleRadians": 1.0471975511965976
            }
          }
        },
        "hand": {
          "durationSimSeconds": 1.9,
          "rearwardSimSeconds": 0.45,
          "dwellSimSeconds": 0.15,
          "forwardSimSeconds": 0.45,
          "unlockSimSeconds": 0.25,
          "lockSimSeconds": 0.25
        },
        "ejectAt": 0.4074074074074074,
        "ejectDirection": [0.12038585308576918, 0.24077170617153837, 0.9630868246861535],
        "holdOpen": false
      },
      "internalMagazine": { "capacity": 5 },
      "attachments": [],
      "attachmentSlots": [
        {
          "id": "barrel.muzzle.0",
          "mount": "muzzle",
          "position": [0.529, 0, 0],
          "direction": [1, 0, 1.2246467991473532e-16],
          "up": [0, 1, 0]
        },
        {
          "id": "handguard.rail.0",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 0,
          "position": [0.023, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.1",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 1,
          "position": [0.046, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.2",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 2,
          "position": [0.069, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.3",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 3,
          "position": [0.092, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.4",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 4,
          "position": [0.115, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.5",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 5,
          "position": [0.138, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.6",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 6,
          "position": [0.161, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.7",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 7,
          "position": [0.184, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.8",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 8,
          "position": [0.207, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.9",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 9,
          "position": [0.23, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.10",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 10,
          "position": [0.253, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.11",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 11,
          "position": [0.276, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.12",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 12,
          "position": [0.299, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail.13",
          "mount": "rail-top",
          "railId": "handguard.rail",
          "notchIndex": 13,
          "position": [0.322, 0.020125, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.0",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 0,
          "position": [0.023, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.1",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 1,
          "position": [0.046, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.2",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 2,
          "position": [0.069, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.3",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 3,
          "position": [0.092, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.4",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 4,
          "position": [0.115, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.5",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 5,
          "position": [0.138, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.6",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 6,
          "position": [0.161, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.7",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 7,
          "position": [0.184, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.8",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 8,
          "position": [0.207, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.9",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 9,
          "position": [0.23, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.10",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 10,
          "position": [0.253, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.11",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 11,
          "position": [0.276, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.12",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 12,
          "position": [0.299, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-bottom.13",
          "mount": "rail-bottom",
          "railId": "handguard.rail-bottom",
          "notchIndex": 13,
          "position": [0.322, -0.020125, 0],
          "direction": [0, -1, 0],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.0",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 0,
          "position": [0.023, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.1",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 1,
          "position": [0.046, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.2",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 2,
          "position": [0.069, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.3",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 3,
          "position": [0.092, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.4",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 4,
          "position": [0.115, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.5",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 5,
          "position": [0.138, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.6",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 6,
          "position": [0.161, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.7",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 7,
          "position": [0.184, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.8",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 8,
          "position": [0.207, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.9",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 9,
          "position": [0.23, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.10",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 10,
          "position": [0.253, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.11",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 11,
          "position": [0.276, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.12",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 12,
          "position": [0.299, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "handguard.rail-side.13",
          "mount": "rail-side",
          "railId": "handguard.rail-side",
          "notchIndex": 13,
          "position": [0.322, 0, 0.020125],
          "direction": [-1.2246467991473532e-16, 0, 1],
          "up": [1, 0, 1.2246467991473532e-16]
        },
        {
          "id": "receiver.rail.0",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 0,
          "position": [-0.161, 0.031625, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.1",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 1,
          "position": [-0.138, 0.031625, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.2",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 2,
          "position": [-0.115, 0.031625, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.3",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 3,
          "position": [-0.092, 0.031625, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.4",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 4,
          "position": [-0.069, 0.031625, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.5",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 5,
          "position": [-0.046, 0.031625, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        },
        {
          "id": "receiver.rail.6",
          "mount": "rail-top",
          "railId": "receiver.rail",
          "notchIndex": 6,
          "position": [-0.023, 0.031625, 0],
          "direction": [0, 1, 0],
          "up": [1, 0, 0]
        }
      ],
      "compatibility": {
        "barrel.muzzle.0": ["real-suppressor", "improvised-suppressor"],
        "handguard.rail.0": [],
        "handguard.rail.1": [],
        "handguard.rail.2": [],
        "handguard.rail.3": [],
        "handguard.rail.4": [],
        "handguard.rail.5": [],
        "handguard.rail.6": [],
        "handguard.rail.7": [],
        "handguard.rail.8": [],
        "handguard.rail.9": [],
        "handguard.rail.10": [],
        "handguard.rail.11": [],
        "handguard.rail.12": [],
        "handguard.rail.13": [],
        "handguard.rail-bottom.0": ["foregrip"],
        "handguard.rail-bottom.1": ["foregrip"],
        "handguard.rail-bottom.2": ["foregrip"],
        "handguard.rail-bottom.3": ["foregrip"],
        "handguard.rail-bottom.4": ["foregrip"],
        "handguard.rail-bottom.5": ["foregrip"],
        "handguard.rail-bottom.6": ["foregrip"],
        "handguard.rail-bottom.7": ["foregrip"],
        "handguard.rail-bottom.8": ["foregrip"],
        "handguard.rail-bottom.9": ["foregrip"],
        "handguard.rail-bottom.10": ["foregrip"],
        "handguard.rail-bottom.11": ["foregrip"],
        "handguard.rail-bottom.12": ["foregrip"],
        "handguard.rail-bottom.13": ["foregrip"],
        "handguard.rail-side.0": ["tactical-flashlight-mount"],
        "handguard.rail-side.1": ["tactical-flashlight-mount"],
        "handguard.rail-side.2": ["tactical-flashlight-mount"],
        "handguard.rail-side.3": ["tactical-flashlight-mount"],
        "handguard.rail-side.4": ["tactical-flashlight-mount"],
        "handguard.rail-side.5": ["tactical-flashlight-mount"],
        "handguard.rail-side.6": ["tactical-flashlight-mount"],
        "handguard.rail-side.7": ["tactical-flashlight-mount"],
        "handguard.rail-side.8": ["tactical-flashlight-mount"],
        "handguard.rail-side.9": ["tactical-flashlight-mount"],
        "handguard.rail-side.10": ["tactical-flashlight-mount"],
        "handguard.rail-side.11": ["tactical-flashlight-mount"],
        "handguard.rail-side.12": ["tactical-flashlight-mount"],
        "handguard.rail-side.13": ["tactical-flashlight-mount"],
        "receiver.rail.0": [],
        "receiver.rail.1": [],
        "receiver.rail.2": [],
        "receiver.rail.3": ["optic-hunting-3-9x", "optic-high-mag-5-25x", "optic-digital-thermal"],
        "receiver.rail.4": [],
        "receiver.rail.5": [],
        "receiver.rail.6": []
      },
      "compatibilityPairs": [
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.0", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.1", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.10", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.11", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.12", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.13", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.2", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.3", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.4", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.5", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.6", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.7", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.8", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-bottom.9", "foregrip"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["barrel.muzzle.0", "improvised-suppressor"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.0", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.1", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.10", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.11", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.12", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.13", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.2", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.3", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.4", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.5", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.6", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.7", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.8", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-bottom.9", "foregrip"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["barrel.muzzle.0", "real-suppressor"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.1", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.10", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.11", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.12", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.13", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.0", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.10", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.11", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.12", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.13", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.1", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.11", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.12", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.13", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.10", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.12", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.13", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.11", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.13", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.12", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.12", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.12", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-bottom.2", "foregrip"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.13", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.13", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.13", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.3", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.2", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.4", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.3", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.5", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.4", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-bottom.6", "foregrip"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.5", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-bottom.7", "foregrip"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.6", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-bottom.8", "foregrip"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.7", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-bottom.9", "foregrip"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.8", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.0", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.1", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.10", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.11", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.12", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.13", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.2", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.3", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.4", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.5", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.6", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.7", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.8", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["handguard.rail-side.9", "tactical-flashlight-mount"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-bottom.9", "foregrip"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.1", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.10", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.11", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.12", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.13", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.0", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.0", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.10", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.11", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.12", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.13", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.1", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.1", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.11", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.12", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.13", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.10", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.10", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.12", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.13", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.11", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.11", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.13", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.12", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.12", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.12", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.12", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.13", "tactical-flashlight-mount"],
          ["handguard.rail-side.2", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.13", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.13", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.13", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.13", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.13", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.13", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.13", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.13", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.13", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.13", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.3", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.2", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.2", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.4", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.3", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.3", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.5", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.4", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.4", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.5", "tactical-flashlight-mount"],
          ["handguard.rail-side.6", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.5", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.5", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.5", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.5", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.6", "tactical-flashlight-mount"],
          ["handguard.rail-side.7", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.6", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.6", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.6", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.7", "tactical-flashlight-mount"],
          ["handguard.rail-side.8", "tactical-flashlight-mount"]
        ],
        [
          ["handguard.rail-side.7", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.7", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [
          ["handguard.rail-side.8", "tactical-flashlight-mount"],
          ["handguard.rail-side.9", "tactical-flashlight-mount"]
        ],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.8", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-digital-thermal"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-high-mag-5-25x"]],
        [["handguard.rail-side.9", "tactical-flashlight-mount"], ["receiver.rail.3", "optic-hunting-3-9x"]]
      ]
    },
    { "id": "round_308_h_winchester", "file": "assets/models/round-308_h_winchester.glb", "calibre": "308-winchester" },
    { "id": "case_308_h_winchester", "file": "assets/models/case-308_h_winchester.glb", "calibre": "308-winchester" },
    {
      "id": "optic_hunting_3_9x",
      "file": "assets/models/optic_hunting_3_9x.glb",
      "attachment": {
        "id": "optic-hunting-3-9x",
        "kind": "optic",
        "massKg": 0.17393058603090866,
        "mount": "rail-top",
        "properties": {
          "reticleKind": "crosshair",
          "magnification": { "min": 3, "max": 9 },
          "railSpanNotches": { "minOffset": -3, "maxOffset": 3 }
        },
        "sight": {
          "kind": "optic",
          "eye": [-0.1495, 0.025875, 0],
          "direction": [1, 0, 0],
          "up": [0, 1, 0],
          "eyeReliefMetres": 0.092,
          "ocularDiameterMetres": 0.031625
        },
        "mountFrame": { "normal": [0, -1, 0], "up": [1, 0, 0] }
      }
    }
  ]
}
