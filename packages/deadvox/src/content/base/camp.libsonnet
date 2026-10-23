local spawnMarker = function(type, chance) { spawn: type, chance: chance };
local ordinaryDesk = std.filter(function(piece) piece.id == 'desk', (import 'furniture.jsonnet').furniture)[0];
local senses = import "senses.jsonnet";
local playerSense = [sense for sense in senses.senses if sense.id == "player"][0];
local blockSizeMetres = 0.5; // Must match src/core/scale.ts, BLOCK_SIZE.
local crouchHoleHeight = std.ceil(playerSense.crouch.bodyHeightMetres / blockSizeMetres);
local campWallRunLayers = [
  ["================================", "================================"],
  ["================================", "================================"],
  ["================================", "================================"],
  ["================================", "================================"],
  ["====.=======.=======.=======.===", "=.=======.=======.=======.======"],
  ["================================", "================================"],
  ["================================", "================================"],
  ["================================", "================================"],
];
local campWallRun = {
  id: "camp_wall_run",
  size: [32, 8, 2],
  palette: { ".": "air", "=": "sandbag" },
  layers: campWallRunLayers,
};
local crouchHoleRow = function(row)
  std.substr(row, 0, 15) + ".." + std.substr(row, 17, 15);
local campWallRunCrouchHole = campWallRun + {
  id: "camp_wall_run_crouch_hole",
  layers: [
    // Keep the base course: template air here clears the terrain block and leaves a sunken threshold.
    if y >= 1 && y < 1 + crouchHoleHeight then
      [crouchHoleRow(campWallRunLayers[y][0]), crouchHoleRow(campWallRunLayers[y][1])]
    else campWallRunLayers[y]
    for y in std.range(0, 7)
  ],
};
{
  "items": [
    {
      "id": "camp_armoury_key",
      "name": "Military armoury key",
      "category": "tool",
      "size": [1, 1],
      "key": {
        "lock": "camp_armoury"
      },
      "model": "camp_armoury_key",
      "description": "A key for the locked armoury container."
    },
    {
      "id": "camp_supply_manifest",
      "name": "Military supply manifest",
      "category": "book",
      "weight": 5,
      "size": [1, 1],
      "model": "notebook",
      "readable": {
        "title": "Clinic supply manifest",
        "text": "SUPPLY RECORD — COMMUNITY HEALTH SITE\n\nAntibiotics, sampling kits and dressings were sent to the clinic. Keep the ward stocked and the pharmacy secured. The road remains under military protection."
      }
    },
    {
      "id": "camp_hq_safe_key",
      "name": "HQ reserve key",
      "category": "tool",
      "size": [1, 1],
      "key": { "lock": "camp_hq_safe" },
      "model": "camp_hq_safe_key",
      "description": "A key for the reserve safe in the officers' quarters."
    },
    {
      "id": "camp_hq_safe_note",
      "name": "Officer's note",
      "category": "note",
      "model": "paper_sheet",
      "weight": 5,
      "size": [1, 1],
      "readable": {
        "title": "Note to the relief officer",
        "text": "The reserve safe is locked. Its key is in the radio desk drawer downstairs. The suppressor in the safe is for the next patrol taking the north road."
      }
    },
    {
      "id": "camp_closing_note",
      "name": "Playtest closing note",
      "category": "note",
      "model": "folded_note",
      "weight": 5,
      "size": [1, 1],
      "readable": {
        "title": "A note for the next visitor",
        "text": "Thank you for playtesting Deadvox. This is the end of the authored military-camp playtest. To share feedback or reach the project home, press F9 and use Project home. You can stop here or continue playing."
      }
    }
  ],
  "loot": [
    {
      "id": "camp_supplies",
      "rolls": [1, 2],
      "entries": [
        {
          "item": "canned_beans",
          "weight": 2
        },
        {
          "item": "water_bottle",
          "weight": 2
        },
        {
          "item": "bandage",
          "weight": 1
        },
        {
          "item": "camp_supply_manifest",
          "weight": 1
        },
        {
          "nothing": true,
          "weight": 3
        }
      ]
    },
    {
      "id": "camp_hq_secure_cache",
      "rolls": [1, 1],
      "entries": [{ "nothing": true, "weight": 1 }]
    },
    {
      // The FOB armoury's own table: another military site gets its own, so tuning the FOB's stock stays local.
      "id": "military_armoury",
      "rolls": [1, 2],
      "entries": [
        { "item": "rifle_assault", "weight": 1, "condition": [0.5, 1] },
        { "item": "rifle_ak", "weight": 1, "condition": [0.5, 1] },
        { "item": "magazine_stanag_20", "weight": 1, "count": [3, 3] },
        { "item": "magazine_stanag_30", "weight": 2, "count": [3, 3] },
        { "item": "magazine_akm_30", "weight": 2, "count": [3, 3] },
        { "item": "foregrip", "weight": 1 },
        { "item": "optic_fixed_prism_4x", "weight": 1 },
        { "item": "optic_high_mag_5_25x", "weight": 1 },
        { "item": "optic_holographic", "weight": 1 },
        { "item": "optic_lpvo_1_6x", "weight": 1 },
        { "item": "optic_mini_reflex", "weight": 1 },
        { "item": "optic_tube_dot", "weight": 1 },
        { "item": "rail_front_sight", "weight": 1 },
        { "item": "real_suppressor", "weight": 1 },
        { "item": "tactical_flashlight_mount", "weight": 1 },
        { "item": "weapon_sling", "weight": 1 },
        { "item": "cartridge_box_5_d_56x45", "weight": 3, "count": [10, 10] },
        { "item": "cartridge_box_7_d_62x39", "weight": 3, "count": [10, 10] },
        { "item": "cartridge_5_d_56x45", "weight": 2, "count": [50, 150] },
        { "item": "cartridge_7_d_62x39", "weight": 2, "count": [50, 150] },
        { "nothing": true, "weight": 28 }
      ]
    }
  ],
  "furniture": [
    {
      "id": "container_door",
      "name": "Steel container door",
      "size": [2, 4, 1],
      "color": "#718087",
      material: 'steel',
      breach: { minimumStrength: 9, durability: 300 },
      "door": {
        "handlingSimSeconds": 0.6,
        "methods": { pry: {
          "quality": 'prying', level: 3, strikeSound: 'lock_pry',
          "skill": "mechanics",
          "timeSimSeconds": 15,
          "fastestTimeSimSeconds": 7.5,
          "strikeIntervalSimSeconds": 0.5
        } },
        detail: (import 'door-detail.libsonnet').ribbed,
      }
    },
    {
      "id": "rifle_rack",
      "name": "Rifle rack",
      "size": [4, 3, 1],
      "color": "#69716f",
      "shape": [
        { "position": [0, 0, 0.86], "size": [4, 3, 0.14], "color": "#4a5256" },
        { "position": [0, 0, 0], "size": [0.18, 3, 0.86] },
        { "position": [1.91, 0, 0], "size": [0.18, 3, 0.86] },
        { "position": [3.82, 0, 0], "size": [0.18, 3, 0.86] },
        { "position": [0.18, 0, 0.06], "size": [1.73, 0.2, 0.8], "color": "#71674f" },
        { "position": [2.09, 0, 0.06], "size": [1.73, 0.2, 0.8], "color": "#71674f" },
        { "position": [0.18, 2.25, 0.56], "size": [1.73, 0.16, 0.3], "color": "#71674f" },
        { "position": [2.09, 2.25, 0.56], "size": [1.73, 0.16, 0.3], "color": "#71674f" },
        { "position": [0.68, 2.25, 0.28], "size": [0.14, 0.16, 0.28], "color": "#71674f" },
        { "position": [1.27, 2.25, 0.28], "size": [0.14, 0.16, 0.28], "color": "#71674f" },
        { "position": [2.59, 2.25, 0.28], "size": [0.14, 0.16, 0.28], "color": "#71674f" },
        { "position": [3.18, 2.25, 0.28], "size": [0.14, 0.16, 0.28], "color": "#71674f" },
        { "position": [0, 2.82, 0], "size": [4, 0.18, 0.86] }
      ],
      "container": {
        "pockets": [
          { "name": "Left bay", "grid": [10, 14], "handlingSimSeconds": 1.2 },
          { "name": "Right bay", "grid": [10, 14], "handlingSimSeconds": 1.2 }
        ]
      },
    },
    {
      "id": "ammo_crate",
      "name": "Ammunition crate",
      "size": [2, 2, 2],
      "color": "#77725a",
      "shape": [
        { "position": [0.08, 0.08, 0.08], "size": [1.84, 1.53, 1.84] },
        { "position": [0.04, 1.61, 0.04], "size": [1.92, 0.05, 1.92], "color": "#4f4c3e" },
        { "position": [0.04, 1.66, 0.04], "size": [1.92, 0.22, 1.92], "color": "#8b8264" },
        { "position": [0.25, 0, 0.02], "size": [0.18, 1.66, 0.1], "color": "#a08f6b" },
        { "position": [1.57, 0, 0.02], "size": [0.18, 1.66, 0.1], "color": "#a08f6b" },
        { "position": [0.25, 0, 1.88], "size": [0.18, 1.66, 0.1], "color": "#a08f6b" },
        { "position": [1.57, 0, 1.88], "size": [0.18, 1.66, 0.1], "color": "#a08f6b" },
        { "position": [0.25, 1.88, 0.02], "size": [0.18, 0.12, 1.96], "color": "#a08f6b" },
        { "position": [1.57, 1.88, 0.02], "size": [0.18, 0.12, 1.96], "color": "#a08f6b" },
        { "position": [0.02, 1.05, 0.64], "size": [0.08, 0.32, 0.72], "color": "#4a5256" },
        { "position": [1.9, 1.05, 0.64], "size": [0.08, 0.32, 0.72], "color": "#4a5256" },
        { "position": [0, 1.13, 0.68], "size": [0.02, 0.08, 0.64], "color": "#91979a" },
        { "position": [1.98, 1.13, 0.68], "size": [0.02, 0.08, 0.64], "color": "#91979a" }
      ],
      "container": {
        "pockets": [
          {
            "grid": [9, 9],
            "handlingSimSeconds": 1.2
          }
        ]
      },
    },
    {
      "id": "ammo_can",
      "name": "Ammunition can",
      "size": [1, 1, 1],
      "color": "#5b6142",
      "appearance": { "kind": "lid", "surface": "painted-metal" },
      "container": {
        "pockets": [
          {
            "grid": [3, 2],
            "handlingSimSeconds": 0.8
          }
        ]
      }
    },
    {
      "id": "footlocker",
      "name": "Footlocker",
      "size": [2, 1, 1],
      "color": "#6b756f",
      "shape": [
        { "position": [0.04, 0.02, 0.04], "size": [1.92, 0.75, 0.92] },
        { "position": [0.02, 0.77, 0.02], "size": [1.96, 0.03, 0.96], "color": "#3e4847" },
        { "position": [0.02, 0.8, 0.02], "size": [1.96, 0.18, 0.96], "color": "#7d8780" },
        { "position": [0, 0, 0], "size": [0.1, 1, 0.1], "color": "#4a5256" },
        { "position": [1.9, 0, 0], "size": [0.1, 1, 0.1], "color": "#4a5256" },
        { "position": [0, 0, 0.9], "size": [0.1, 1, 0.1], "color": "#4a5256" },
        { "position": [1.9, 0, 0.9], "size": [0.1, 1, 0.1], "color": "#4a5256" },
        { "position": [0.1, 0, 0], "size": [1.8, 0.05, 1], "color": "#4a5256" },
        { "position": [0.1, 0.95, 0], "size": [1.8, 0.05, 1], "color": "#4a5256" },
        { "position": [0.36, 0.65, 0], "size": [0.18, 0.21, 0.06], "color": "#b0a88b" },
        { "position": [1.46, 0.65, 0], "size": [0.18, 0.21, 0.06], "color": "#b0a88b" },
        { "position": [0.76, 0.56, 0], "size": [0.48, 0.09, 0.06], "color": "#3e4847" },
        { "position": [0.8, 0.59, 0], "size": [0.4, 0.03, 0.02], "color": "#91979a" },
        { "position": [0.36, 0.72, 0.94], "size": [0.22, 0.17, 0.06], "color": "#4a5256" },
        { "position": [1.42, 0.72, 0.94], "size": [0.22, 0.17, 0.06], "color": "#4a5256" }
      ],
      "container": {
        "pockets": [
          {
            "grid": [9, 4],
            "handlingSimSeconds": 1
          }
        ]
      },
    },
    {
      "id": "camp_cot",
      "name": "Folding cot",
      "size": [2, 1, 4],
      "color": "#677a82",
      "shape": [
        { "position": [0.05, 0, 0.05], "size": [0.08, 0.3, 0.08], "color": "#4a5256" },
        { "position": [1.87, 0, 0.05], "size": [0.08, 0.3, 0.08], "color": "#4a5256" },
        { "position": [0.05, 0, 3.87], "size": [0.08, 0.3, 0.08], "color": "#4a5256" },
        { "position": [1.87, 0, 3.87], "size": [0.08, 0.3, 0.08], "color": "#4a5256" },
        { "position": [0.05, 0, 1.96], "size": [0.08, 0.3, 0.08], "color": "#4a5256" },
        { "position": [1.87, 0, 1.96], "size": [0.08, 0.3, 0.08], "color": "#4a5256" },
        { "position": [0.05, 0.3, 0.05], "size": [1.9, 0.08, 3.9], "color": "#5b6468" },
        { "position": [0.12, 0.38, 0.12], "size": [1.76, 0.07, 3.76], "color": "#b7ab8a" },
        { "position": [0.1, 0.45, 0.12], "size": [1.8, 0.1, 2.4], "color": "#5d6a4a" },
        { "position": [0.3, 0.45, 3.2], "size": [1.4, 0.14, 0.55], "color": "#c9c3b0" }
      ],
      "rest": {
        "quality": 0.6,
        "sleep": true
      }
    },
    {
      "id": "camp_hq_safe",
      "name": "Steel reserve safe",
      "size": [3, 2, 2],
      "color": "#59656a",
      "shape": [{ "position": [0, 0, 0], "size": [3, 2, 2] }],
      "container": {
        "pockets": [{ "grid": [4, 4], "handlingSimSeconds": 1.2 }]
      },
      material: 'steel',
      "door": { methods: {}, "handlingSimSeconds": 0.6 }
    },
    {
      "id": "field_desk",
      "name": "Field desk",
      "size": [3, 2, 2],
      "color": ordinaryDesk.color,
      "shape": ordinaryDesk.shape,
      "container": {
        "pockets": [
          {
            "grid": [6, 4],
            "handlingSimSeconds": 1
          }
        ]
      },
    },
    {
      "id": "camp_orders",
      "name": "Camp orders board",
      "size": [2, 2, 1],
      "color": "#a6936f",
      "solid": false,
      "shape": [
        { "position": [0, 1, 0.4], "size": [2, 1, 0.2] },
        { "position": [0.2, 0, 0.4], "size": [0.2, 1, 0.2] },
        { "position": [1.6, 0, 0.4], "size": [0.2, 1, 0.2] }
      ],
      "readable": {
        "title": "Orders for the road",
        "text": "Hold the road and keep the clinic supplied. The medical site is under the camp's protection. Keep the armoury locked; its key stays with the officer."
      }
    },
    {
      "id": "camp_sandbag_barricade",
      "name": "Sandbag barricade",
      "size": [2, 2, 2],
      "color": "#9b8d6a",
      "solid": true
    },
    {
      "id": "camp_gate_leaf",
      "name": "Camp fence-gate leaf",
      "size": [6, 5, 1],
      "color": "#666c70",
      material: 'steel',
      breach: { minimumStrength: 9, durability: 300 },
      "door": {
        methods: {},
        "handlingSimSeconds": 1.2,
        // A fence gate: upright bars in a frame, hung on heavy straps.
        detail: (import 'door-detail.libsonnet').ribbed + {
          fields: [8, 1],
          hinges: { count: 2, length: 0.3, width: 0.08 },
          handle: { kind: 'pull', fromFreeEdge: 0.15, along: 0.45, length: 0.3, thickness: 0.03 },
        },
      }
    }
  ],
  "templates": [
    {
      "id": "camp_armoury",
      "size": [20, 6, 12],
      "palette": {
        ".": "air",
        "=": "concrete",
        "#": "galvanized",
        "D": {
          "furniture": "container_door",
          "facing": "n",
          "lock": {
            "id": "camp_armoury",
            "locked": true
          }
        },
        "R": {
          "furniture": "rifle_rack",
          "loot": "military_armoury"
        },
        "A": {
          "furniture": "ammo_crate",
          "loot": "military_armoury"
        },
        "N": {
          "furniture": "field_desk",
          "facing": "n",
          "loot": "d41_empty"
        },
        // Leave room for a body between the ladder and magazine crate; it climbs through the roof hatch so the
        // climber steps onto the roof rather than the strip above a wall (`DESIGN.md`, "Ladders and hatches").
        "H": {
          "furniture": "ladder",
          "facing": "w"
        },
        "T": {
          "furniture": "roof_hatch",
          "facing": "w"
        }
      },
      "layers": [
        [
          "====================",
          "====================",
          "====================",
          "====================",
          "====================",
          "====================",
          "====================",
          "====================",
          "====================",
          "====================",
          "====================",
          "===================="
        ],
        [
          "#########DD#########",
          "#..................#",
          "#..................#",
          "#..RRRR............#",
          "#..................#",
          "#......AA..H.......#",
          "#......AA..H.......#",
          "#............AA....#",
          "#............AA....#",
          "#..NNN.............#",
          "#..NNN.............#",
          "####################"
        ],
        [
          "#########DD#########",
          "#..................#",
          "#..................#",
          "#..RRRR............#",
          "#..................#",
          "#......AA..H.......#",
          "#......AA..H.......#",
          "#............AA....#",
          "#............AA....#",
          "#..NNN.............#",
          "#..NNN.............#",
          "####################"
        ],
        [
          "#########DD#########",
          "#..................#",
          "#..................#",
          "#..RRRR............#",
          "#..................#",
          "#..........H.......#",
          "#..........H.......#",
          "#..................#",
          "#..................#",
          "#..................#",
          "#..................#",
          "####################"
        ],
        [
          "#########DD#########",
          "#..................#",
          "#..................#",
          "#..................#",
          "#..................#",
          "#..........H.......#",
          "#..........H.......#",
          "#..................#",
          "#..................#",
          "#..................#",
          "#..................#",
          "####################"
        ],
        [
          "####################",
          "####################",
          "####################",
          "####################",
          "####################",
          "##########TTT#######",
          "##########TTT#######",
          "####################",
          "####################",
          "####################",
          "####################",
          "####################"
        ]
      ]
    },
    {
      "id": "camp_command_tent",
      "size": [16, 7, 10],
      "palette": {
        ".": "air",
        "T": "fabric",
        "=": "planks",
        "W": {
          "furniture": "field_desk",
          "loot": "camp_supplies"
        },
        "O": {
          "furniture": "camp_orders"
        },
        "F": {
          "furniture": "footlocker",
          "loot": "camp_supplies"
        },
        "z": spawnMarker("military_shambler", 0.5)
      },
      "layers": [
        [
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================"
        ],
        [
          "TTTTTTTTTTTTTTTT",
          "T...............",
          "T..........z....",
          "T.....WWW......T",
          "T.....WWW......T",
          "T...OO.........T",
          "T..............T",
          "T........FF....T",
          "T..............T",
          "TTTTTTTTTTTTTTTT"
        ],
        [
          "TTTTTTTTTTTTTTTT",
          "T...............",
          "T...............",
          "T.....WWW......T",
          "T.....WWW......T",
          "T...OO.........T",
          "T..............T",
          "T..............T",
          "T..............T",
          "TTTTTTTTTTTTTTTT"
        ],
        [
          "TTTTTTTTTTTTTTTT",
          "T...............",
          "T...............",
          "T..............T",
          "T..............T",
          "T..............T",
          "T..............T",
          "T..............T",
          "T..............T",
          "TTTTTTTTTTTTTTTT"
        ],
        [
          "TTTTTTTTTTTTTTTT",
          "T...............",
          "T...............",
          "T..............T",
          "T..............T",
          "T..............T",
          "T..............T",
          "T..............T",
          "T..............T",
          "TTTTTTTTTTTTTTTT"
        ],
        [
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT"
        ],
        [
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT",
          "TTTTTTTTTTTTTTTT"
        ]
      ],
      "access": {
        "ground": "ground",
        "entrance": [15, 1, 2],
        "storeys": [
          {
            "id": "ground",
            "floor": 1
          }
        ],
        "stairs": []
      }
    },
    {
      "id": "camp_container",
      "size": [18, 6, 10],
      "palette": {
        ".": "air",
        "=": "concrete",
        "#": "galvanized",
        "D": {
          "furniture": "container_door",
          "facing": "n"
        },
        "F": {
          "furniture": "footlocker",
          "loot": "camp_supplies"
        }
      },
      "layers": [
        [
          "==================",
          "==================",
          "==================",
          "==================",
          "==================",
          "==================",
          "==================",
          "==================",
          "==================",
          "=================="
        ],
        [
          "########DD########",
          "#................#",
          "#................#",
          "#...FF...........#",
          "#...FF...........#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "##################"
        ],
        [
          "########DD########",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "##################"
        ],
        [
          "########DD########",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "##################"
        ],
        [
          "########DD########",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "#................#",
          "##################"
        ],
        [
          "##################",
          "##################",
          "##################",
          "##################",
          "##################",
          "##################",
          "##################",
          "##################",
          "##################",
          "##################"
        ]
      ]
    },
    {
      "id": "camp_tent",
      "size": [12, 4, 8],
      "palette": {
        ".": "air",
        "T": "fabric",
        "B": {
          "furniture": "camp_cot"
        },
        "F": {
          "furniture": "footlocker",
          "loot": "camp_supplies"
        },
        "z": spawnMarker("military_shambler", 0.4),
        "=": "dirt"
      },
      "layers": [
        [
          "============",
          "============",
          "============",
          "============",
          "============",
          "============",
          "============",
          "============"
        ],
        [
          "TTTT....TTTT",
          "T..........T",
          "T.BB..BB...T",
          "T.BB..BB...T",
          "T.BB..BBFF.T",
          "T.BB..BBFF.T",
          "T..........T",
          "TTTT....TTTT"
        ],
        [
          "TTTT....TTTT",
          "TTTT....TTTT",
          "TTTT....TTTT",
          "TTTT....TTTT",
          "TTTT......TT",
          "TTTT......TT",
          "TTTT....TTTT",
          "TTTT....TTTT"
        ],
        [
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............"
        ]
      ]
    },
    {
      "id": "camp_watchtower",
      "size": [12, 11, 12],
      "palette": {
        ".": "air",
        "=": "dirt",
        "#": "planks",
        "S": "sandbag"
      },
      "layers": [
        [
          "============",
          "============",
          "============",
          "============",
          "============",
          "============",
          "============",
          "============",
          "============",
          "============",
          "============",
          "============"
        ],
        [
          "#..........#",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "#..........#"
        ],
        [
          "#..........#",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "#..........#"
        ],
        [
          "#..........#",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "#..........#"
        ],
        [
          "#..........#",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "#..........#"
        ],
        [
          "#..........#",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "#..........#"
        ],
        [
          "############",
          "############",
          "####..######",
          "####..######",
          "####..######",
          "####..######",
          "####..######",
          "####..######",
          "####..######",
          "############",
          "############",
          "############"
        ],
        [
          "............",
          "............",
          "..SSSSSSSS..",
          "..S......S..",
          "..S......S..",
          "..S......S..",
          "..S......S..",
          "..S......S..",
          "..S......S..",
          "..SS...SSS..",
          "............",
          "............"
        ],
        [
          "............",
          "............",
          "..########..",
          "..#......#..",
          "..#......#..",
          "..#......#..",
          "..#......#..",
          "..#......#..",
          "..#......#..",
          "..##...###..",
          "............",
          "............"
        ],
        [
          "............",
          "............",
          "..########..",
          "..#......#..",
          "..#......#..",
          "..#......#..",
          "..#......#..",
          "..#......#..",
          "..#......#..",
          "..##...###..",
          "............",
          "............"
        ],
        [
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............",
          "............"
        ]
      ],
      "access": {
        "ground": "ground",
        "entrance": [2, 1, 1.5],
        "storeys": [
          {
            "id": "ground",
            "floor": 1
          },
          {
            "id": "lookout",
            "floor": 7
          }
        ],
        "stairs": [
          {
            "from": "ground",
            "to": "lookout",
            "lower": [5, 1, 2],
            "upper": [5, 7, 9],
            "width": 2,
            "block": "planks"
          }
        ]
      }
    },
    campWallRun,
    campWallRunCrouchHole,
    {
      "id": "camp_sandbag_post",
      "size": [8, 5, 8],
      "palette": {
        ".": "air",
        "=": "planks",
        "S": "sandbag",
        "C": {
          "furniture": "ammo_can"
        }
      },
      "layers": [
        ["========", "========", "========", "========", "========", "========", "========", "========"],
        ["SSS..SSS", "S......S", "S......S", "S......S", "S......S", "S......S", "S.....CS", "SSSSSSSS"],
        ["SSS..SSS", "S......S", "S......S", "S......S", "S......S", "S......S", "S......S", "SSSSSSSS"],
        ["........", "........", "........", "........", "........", "........", "........", "........"],
        ["........", "........", "........", "........", "........", "........", "........", "........"]
      ],
      "access": {
        "ground": "ground",
        "entrance": [3.5, 1, 3.5],
        "storeys": [
          {
            "id": "ground",
            "floor": 1
          }
        ],
        "stairs": []
      }
    },
    {
      "id": "camp_hq",
      "size": [16, 17, 18],
      "palette": {
        ".": "air",
        "=": "concrete",
        "p": "planks",
        "#": "camo_woodland",
        "G": "galvanized",
        "S": "sandbag",
        "D": {
          "furniture": "wood_door",
          "facing": "n"
        },
        "W": {
          "furniture": "field_desk",
          "loot": "camp_supplies"
        },
        "M": {
          "furniture": "field_desk",
          "loot": "camp_supplies"
        },
        "C": {
          "furniture": "chair"
        },
        "O": {
          "furniture": "camp_orders"
        },
        "B": {
          "furniture": "bed"
        },
        "L": {
          "furniture": "bedroll"
        },
        "R": {
          "furniture": "wardrobe",
          "loot": "wardrobe"
        },
        "F": {
          "furniture": "footlocker",
          "loot": "camp_supplies"
        },
        "Q": {
          "furniture": "camp_hq_safe",
          "loot": "camp_hq_secure_cache",
          "facing": "n",
          "lock": { "id": "camp_hq_safe", "locked": true }
        },
        "z": spawnMarker("military_shambler", 0.4)
      },
      "layers": [
        [
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================",
          "================"
        ],
        [
          "SSSSSSSDDSSSSSSS",
          "#..............#",
          "#..............#",
          "#..............#",
          "#....WWW..MMM..#",
          "#....WWW..MMM..#",
          "#...C........C.#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#............OO#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..L...........#",
          "#..L...........#",
          "#..............#",
          "################"
        ],
        [
          "SSSSSSSDDSSSSSSS",
          "#..............#",
          "#..............#",
          "#..............#",
          "#....WWW..MMM..#",
          "#....WWW..MMM..#",
          "#...C........C.#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#............OO#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "#######DD#######",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "#######DD#######",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "################",
          "#pppppppppppppp#",
          "#..pppppppppppp#",
          "#..pppppppppppp#",
          "#..pppppppppppp#",
          "#..pppppppppppp#",
          "#..pppppppppppp#",
          "#..pppppppppppp#",
          "#..pppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#............RR#",
          "#..............#",
          "#..............#",
          "#..........BB..#",
          "#..........BB..#",
          "#..........BB..#",
          "#..........BB..#",
          "#..............#",
          "#..........BB..#",
          "#..........BB..#",
          "#FF........BB..#",
          "#..........BB..#",
          "#..............#",
          "#...........QQQ#",
          "#...........QQQ#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#............RR#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#...........QQQ#",
          "#...........QQQ#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#............RR#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#............RR#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "################",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#ppp..ppppppppp#",
          "#ppp..ppppppppp#",
          "#ppp..ppppppppp#",
          "#ppp..ppppppppp#",
          "#ppp..ppppppppp#",
          "#ppp..ppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "#pppppppppppppp#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "GWWW....WWW....G",
          "#WWW....WWW....#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#.......z......#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#WWW....WWW....#",
          "#WWW....WWW....#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "################",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "#..............#",
          "################"
        ],
        [
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................",
          "................"
        ]
      ],
      "access": {
        "ground": "ground",
        "entrance": [8, 1, 1.5],
        "storeys": [
          {
            "id": "ground",
            "floor": 1
          },
          {
            "id": "operations",
            "floor": 7
          },
          {
            "id": "observation",
            "floor": 13
          }
        ],
        "stairs": [
          {
            "from": "ground",
            "to": "operations",
            "lower": [2, 1, 2],
            "upper": [2, 7, 9],
            "width": 2,
            "block": "planks"
          },
          {
            "from": "operations",
            "to": "observation",
            "lower": [5, 7, 10],
            "upper": [5, 13, 3],
            "width": 2,
            "block": "planks"
          }
        ]
      }
    },
    {
      "id": "camp_gate",
      "size": [16, 9, 2],
      "palette": {
        ".": "air",
        "=": "dirt",
        "#": "sandbag",
        "L": {
          "furniture": "camp_gate_leaf",
          "facing": "n"
        },
        "R": {
          "furniture": "camp_gate_leaf",
          "facing": "s"
        }
      },
      "layers": [
        ["================", "================"],
        ["##LLLLLLRRRRRR##", "................"],
        ["##LLLLLLRRRRRR##", "................"],
        ["##LLLLLLRRRRRR##", "................"],
        ["##LLLLLLRRRRRR##", "................"],
        ["##LLLLLLRRRRRR##", "................"],
        ["################", "################"],
        ["################", "################"],
        ["################", "################"]
      ]
    },
    {
      "id": "camp_gate_damaged",
      "size": [16, 9, 2],
      "palette": {
        ".": "air",
        "=": "dirt",
        "#": "sandbag",
        "L": {
          "furniture": "camp_gate_leaf",
          "facing": "n"
        },
        "R": {
          "furniture": "camp_gate_leaf",
          "facing": "s"
        }
      },
      "layers": [
        ["================", "================"],
        ["##LLLLLL......##", "................"],
        ["##LLLLLL......##", "................"],
        ["##LLLLLL......##", "................"],
        ["##LLLLLL......##", "................"],
        ["##LLLLLL......##", "................"],
        ["################", "################"],
        ["################", "################"],
        ["################", "################"]
      ]
    },
    {
      "id": "camp_gate_return",
      "size": [2, 9, 16],
      "palette": {
        ".": "air",
        "=": "dirt",
        "#": "sandbag"
      },
      "layers": [
        ["==", "==", "==", "==", "==", "==", "==", "==", "==", "==", "==", "==", "==", "==", "==", "=="],
        ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"],
        ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"],
        ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"],
        ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"],
        ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"],
        ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"],
        ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"],
        ["##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"]
      ]
    }
  ]
}
