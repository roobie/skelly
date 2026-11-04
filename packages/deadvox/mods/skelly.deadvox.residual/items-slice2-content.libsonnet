local lights = import 'tools/jsonnet/lib/lights.libsonnet';

{
  "items": [
    {
      "id": "circuit_board",
      "name": "Circuit board",
      "category": "material",
      "weight": 75,
      "size": [1, 2],
      "stack": 2,
      "model": "circuit_board"
    },
    {
      "id": "glass_lens",
      "name": "Small glass lens",
      "category": "material",
      "weight": 40,
      "size": [1, 1],
      "stack": 3,
      "model": "glass_lens"
    },
    {
      "id": "fuse",
      "name": "Glass fuse",
      "category": "material",
      "size": [1, 1],
      "stack": 10,
      "model": "fuse"
    },
    {
      "id": "broken_toaster",
      "name": "Broken toaster",
      "category": "misc",
      "weight": 1400,
      "size": [3, 2],
      "model": "broken_toaster",
      "salvageTimeGameMinutes": 5,
      "salvage": [
        { "item": "circuit_board", "count": 1 },
        { "item": "fuse", "count": 1 },
        { "item": "scrap_metal", "count": 1 },
        { "item": "copper_wire", "count": 1 }
      ]
    },
    {
      "id": "dead_desk_lamp",
      "name": "Dead desk lamp",
      "category": "misc",
      "size": [2, 3],
      "model": "dead_desk_lamp",
      "salvageTimeGameMinutes": 5,
      "salvage": [
        { "item": "glass_bulb", "count": 1 },
        { "item": "glass_lens", "count": 1 },
        { "item": "copper_wire", "count": 1 },
        { "item": "scrap_metal", "count": 1 }
      ]
    },
    {
      "id": "broken_table_fan",
      "name": "Broken table fan",
      "category": "misc",
      "weight": 1500,
      "size": [3, 3],
      "model": "table_fan",
      "salvageTimeGameMinutes": 5,
      "salvage": [
        { "item": "small_spring", "count": 1 },
        { "item": "copper_wire", "count": 1 },
        { "item": "scrap_metal", "count": 1 }
      ]
    },
    {
      "id": "cracked_phone",
      "name": "Cracked mobile phone",
      "category": "misc",
      "weight": 250,
      "size": [1, 2],
      "model": "cracked_phone",
      "salvageTimeGameMinutes": 5,
      "salvage": [
        { "item": "circuit_board", "count": 1 },
        { "item": "glass_shards", "count": 1 },
        { "item": "copper_wire", "count": 1 }
      ]
    },
    {
      "id": "broken_clock",
      "name": "Broken alarm clock",
      "category": "misc",
      "weight": 350,
      "size": [2, 2],
      "model": "broken_clock",
      "salvageTimeGameMinutes": 5,
      "salvage": [
        { "item": "small_spring", "count": 1 },
        { "item": "circuit_board", "count": 1 },
        { "item": "fastener_pack", "count": 1 }
      ]
    },
    {
      "id": "electrical_repair_kit",
      "name": "Electrical repair kit",
      "category": "tool",
      "weight": 650,
      "size": [2, 2],
      "model": "electrical_repair_kit",
      "description": "Insulated tape, wire and a few replacement fuses.",
      "tool": { "qualities": { "screwing": 1, "repairing": 1 } },
      "disassembly": {
        "timeGameMinutes": 10,
        "skill": "mechanics",
        "yields": [
          { "item": "copper_wire", "count": 1, "fractions": [0.5, 1], "rounding": "floor" },
          { "item": "fuse", "count": 1, "fractions": [0.5, 1], "rounding": "floor" },
          { "item": "electrical_tape", "count": 1, "fractions": [0.5, 1], "rounding": "floor" }
        ]
      }
    },
    {
      "id": "taped_flashlight_mount",
      "name": "Taped-on flashlight mount",
      "category": "light",
      "size": [1, 2],
      "model": "taped_flashlight_mount",
      "description": "A flashlight strapped to a bracket. Taped under the barrel of a long gun, its beam follows the barrel.",
      "lightMount": { "kind": "strap" },
      "light": lights.flashlight,
      "disassembly": {
        "timeGameMinutes": 7,
        "skill": "mechanics",
        "yields": [
          { "item": "scrap_metal", "count": 1, "fractions": [0.5, 1], "rounding": "floor" },
          { "item": "electrical_tape", "count": 1, "fractions": [0.5, 1], "rounding": "floor" }
        ]
      }
    },
    {
      "id": "scrap_foregrip",
      "name": "Scrap foregrip",
      "category": "weapon",
      "size": [1, 2],
      "model": "scrap_foregrip",
      "description": "A rough grip made from a wood offcut and rubber.",
      "disassembly": {
        "timeGameMinutes": 7,
        "skill": "mechanics",
        "yields": [
          { "item": "wood_offcut", "count": 1, "fractions": [0.5, 1], "rounding": "floor" },
          { "item": "rubber_strip", "count": 1, "fractions": [0.5, 1], "rounding": "floor" }
        ]
      }
    },
    {
      "id": "glass_bulb",
      "name": "Small light bulb",
      "category": "material",
      "weight": 30,
      "size": [1, 1],
      "stack": 3,
      "model": "glass_bulb"
    },
    {
      "id": "improvised_suppressor",
      "name": "Improvised suppressor",
      "category": "weapon",
      "weight": 600,
      "size": [2, 2],
      "description": "A heavy scavenged tube with crude end collars.",
      "model": "improvised_suppressor",
      "disassembly": {
        "timeGameMinutes": 8,
        "skill": "mechanics",
        "yields": [{ "item": "scrap_metal", "count": 1, "fractions": [0.5, 1], "rounding": "floor" }]
      },
      "firearmAttachmentEffects": {
        "kind": "suppressor",
        "recoilReduction": 0.05,
        "wearPerShot": 0.02,
        "fitSkillLevel": 4,
        "fitRefusal": "I can't fit this suppressor yet"
      }
    }
  ],
  "recipes": [
    {
      "id": "make_weapon_sling",
      category: 'attachments', tags: ['textile'], searchTerms: [],
      "result": { "item": "weapon_sling", "count": 1 },
      "timeGameMinutes": 4,
      "skills": { "crafting": 2 },
      "qualities": { "cutting": 1 },
      "components": [
        [{ "item": "rope", "count": 1 }, { "item": "nylon_cord", "count": 1 }],
        [{ "item": "fastener_pack", "count": 1 }]
      ]
    },
    {
      "id": "make_electrical_repair_kit",
      category: 'tools', tags: ['electrical'], searchTerms: [],
      "result": { "item": "electrical_repair_kit", "count": 1 },
      "timeGameMinutes": 20,
      "skills": { "mechanics": 0 },
      "qualities": { "screwing": 1 },
      "components": [
        [{ "item": "copper_wire", "count": 1 }],
        [{ "item": "electrical_tape", "count": 1 }],
        [{ "item": "fuse", "count": 1 }]
      ],
      "workstation": "workbench"
    },
    {
      "id": "make_improvised_suppressor",
      category: 'attachments', tags: ['metal'], searchTerms: [],
      "result": { "item": "improvised_suppressor", "count": 1 },
      "timeGameMinutes": 35,
      "skills": { "mechanics": 0 },
      "qualities": { "screwing": 1, "wrenching": 1 },
      "components": [
        [{ "item": "steel_pipe", "count": 1 }],
        [{ "item": "rubber_strip", "count": 1 }],
        [{ "item": "electrical_tape", "count": 1 }]
      ],
      "workstation": "workbench"
    },
    {
      "id": "make_taped_flashlight_mount",
      category: 'attachments', tags: ['electrical', 'metal'], searchTerms: [],
      "consumeFitted": true,
      "result": { "item": "taped_flashlight_mount", "count": 1 },
      "timeGameMinutes": 18,
      "skills": { "mechanics": 0 },
      "qualities": { "screwing": 1 },
      "components": [
        [{ "item": "flashlight", "count": 1 }],
        [{ "item": "scrap_metal", "count": 1 }],
        [{ "item": "electrical_tape", "count": 1 }],
        [{ "item": "fastener_pack", "count": 1 }]
      ],
      "workstation": "workbench"
    },
    {
      "id": "make_scrap_foregrip",
      category: 'attachments', tags: ['wood'], searchTerms: [],
      "result": { "item": "scrap_foregrip", "count": 1 },
      "timeGameMinutes": 15,
      "skills": { "mechanics": 0 },
      "qualities": { "hammering": 1, "sawing": 1 },
      "components": [
        [{ "item": "wood_offcut", "count": 1 }],
        [{ "item": "rubber_strip", "count": 1 }],
        [{ "item": "fastener_pack", "count": 1 }]
      ],
      "workstation": "workbench"
    },
    {
      "id": "repair_machete",
      category: 'repair_tools', tags: ['metal'], searchTerms: [],
      "kind": "repair",
      "result": { "item": "machete", "count": 1 },
      "repair": { "skill": "mechanics", "amount": 0.2, "perSkill": 0.1 },
      "timeGameMinutes": 15,
      "skills": { "mechanics": 0 },
      "qualities": { "repairing": 1 },
      "components": [[{ "item": "scrap_metal", "count": 1 }], [{ "item": "duct_tape", "count": 1 }]]
    },
    {
      "id": "repair_kabar",
      category: 'repair_tools', tags: ['metal'], searchTerms: [],
      "kind": "repair",
      "result": { "item": "kabar", "count": 1 },
      "repair": { "skill": "mechanics", "amount": 0.2, "perSkill": 0.1 },
      "timeGameMinutes": 12,
      "skills": { "mechanics": 0 },
      "qualities": { "repairing": 1 },
      "components": [[{ "item": "scrap_metal", "count": 1 }], [{ "item": "duct_tape", "count": 1 }]]
    },
    {
      "id": "repair_baseball_bat",
      category: 'repair_tools', tags: ['wood'], searchTerms: [],
      "kind": "repair",
      "result": { "item": "baseball_bat", "count": 1 },
      "repair": { "skill": "mechanics", "amount": 0.2, "perSkill": 0.1 },
      "timeGameMinutes": 14,
      "skills": { "mechanics": 0 },
      "qualities": { "repairing": 1, "hammering": 1 },
      "components": [[{ "item": "wood_offcut", "count": 1 }], [{ "item": "duct_tape", "count": 1 }]]
    },
    {
      "id": "repair_steel_pipe",
      category: 'repair_tools', tags: ['metal'], searchTerms: [],
      "kind": "repair",
      "result": { "item": "steel_pipe", "count": 1 },
      "repair": { "skill": "mechanics", "amount": 0.2, "perSkill": 0.1 },
      "timeGameMinutes": 14,
      "skills": { "mechanics": 0 },
      "qualities": { "repairing": 1 },
      "components": [[{ "item": "scrap_metal", "count": 1 }], [{ "item": "duct_tape", "count": 1 }]]
    },
    {
      "id": "repair_flashlight",
      category: 'repair_electrical', tags: ['electrical'], searchTerms: [],
      "kind": "repair",
      "result": { "item": "flashlight", "count": 1 },
      "repair": { "skill": "mechanics", "amount": 0.2, "perSkill": 0.1 },
      "timeGameMinutes": 14,
      "skills": { "mechanics": 0 },
      "qualities": { "screwing": 1 },
      "components": [[{ "item": "fuse", "count": 1 }], [{ "item": "electrical_tape", "count": 1 }]]
    }
  ]
}
