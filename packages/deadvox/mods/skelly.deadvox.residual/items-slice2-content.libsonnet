local lights = import 'tools/jsonnet/lib/lights.libsonnet';

{
  "items": [
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
    }
  ]
}
