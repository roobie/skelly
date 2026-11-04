// Every wearing blade gets one repair per sharpening method: the wheel restores more in less time, so keeping an edge
// is a choice between a trip to the wheel and a stone carried in the field.
local sharpening = [
  { prefix: "grind_", qualities: {}, workstation: "grinding_wheel", amount: 0.5, timeGameMinutes: 10 },
  { prefix: "hone_", qualities: { sharpening: 1 }, workstation: null, amount: 0.2, timeGameMinutes: 20 },
];
local blades = [
  item.id
  for item in (import "packages/mods/skelly.hand-tools/hand-tools-items.jsonnet").items + (import "items-tools.libsonnet").items
  if std.objectHas(item, "weapon") && item.weapon.melee.type == "cut" && std.objectHas(item.weapon.melee, "wearPerHit")
];
local sharpen(blade, method) = {
  id: method.prefix + blade,
  category: "repair_tools",
  tags: ["edge"],
  searchTerms: [],
  kind: "repair",
  activation: "sharpen",
  result: { item: blade, count: 1 },
  repair: { skill: "crafting", amount: method.amount, perSkill: 0.05 },
  timeGameMinutes: method.timeGameMinutes,
  skills: { crafting: 0 },
  qualities: method.qualities,
  components: [],
  workstation: method.workstation,
};
local sharpenRecipes = [sharpen(blade, method) for blade in blades for method in sharpening];
local skillCurve = import 'packages/mods/skelly.progression/skill-curve.libsonnet';
{
  "skills": [skill + { curve: skillCurve } for skill in [
    {
      "id": "firearms_combat", "capability": "firearmsCombat",
      "name": "Firearms Combat (FC)",
      "detail": "Improves recoil control, handling, raising and aiming down sights. Steadies firearms other than long guns.",
      "training": {
        "activities": {
          "readying": { "practicePerSimSecond": 0.1, "tier": 1 },
          "handling": { "practice": 1, "tier": 3 },
          "shot": { "practice": 1, "tier": 3 },
          "hit": { "practice": 1, "tier": 5 },
          "attachment": { "practice": 1, "tier": 1 }
        }
      },
      "combat": {
        "firearms": {
          "longGunSteadinessRole": "longGunSteadiness",
          "raiseMinimumSimSeconds": 0.28,
          "raiseHalfLifeLevels": 5,
          "readyMovementRange": 0.35,
          "readyMovementHalfLifeLevels": 5,
          "wobbleSkillTenVariance": 0.05,
          "reloadFactorFloor": 0.025,
          "reloadFactorHalfLifeLevels": 5,
          "rackFactorFloor": 0.16,
          "rackFactorHalfLifeLevels": 3,
          "attachmentFactorFloor": 0,
          "attachmentFactorHalfLifeLevels": 1.1,
          "breathHold": {
            "steadyingSkillRange": 0.4,
            "steadyingSkillHalfLifeLevels": 5
          }
        }
      }
    },
    {
      "id": "sniping", "capability": "longGunSteadiness",
      "name": "Sniping",
      "detail": "Reduces long-gun sway and look lag. Improves breath steadying with long guns.",
      "steadiness": {
        "wobbleSkillTenVariance": 0.05,
        "steadyingMinimum": 0.5,
        "steadyingSkillRange": 0.4,
        "steadyingSkillHalfLifeLevels": 5,
      },
      "training": { "activities": {
        "acquisition": { "practice": 0.1, "tier": 1 },
        "ads": { "practicePerSimSecond": 0.1, "tier": 1 },
        "shot": { "practice": 1, "tier": 3 },
        "hit": { "practice": 1, "tier": 5 },
      } },
    },
    {
      "id": "melee_combat", "capability": "meleeCombat",
      "name": "Melee Combat (MC)",
      "training": {
        "activities": {
          "block": { "practice": 0.2, "tier": 5 },
          "hit": { "practice": 1, "tier": 5 }
        }
      },
      "combat": {
        "melee": {
          "blockChanceRange": 0.45,
          "blockChanceHalfLifeLevels": 4,
          "mitigationRange": 0.55,
          "mitigationHalfLifeLevels": 3,
          "staminaCostFloor": 0.35,
          "staminaCostHalfLifeLevels": 3
        }
      }
    }
  ]],
  "items": [
    {
      "id": "wooden_plank",
      "name": "Wooden plank",
      "category": "material",
      "model": "wooden_plank",
      "size": [2, 4],
      "disassembly": {
        "timeGameMinutes": 4,
        "skill": "crafting",
        "yields": [{ "item": "stick", "count": 2, "fractions": [0.5, 0.6, 0.7, 0.8, 0.9, 1], "rounding": "floor" }]
      }
    },
    {
      "id": "copper_wire",
      "name": "Salvaged wire",
      "category": "material",
      "size": [1, 2],
      "model": "copper_wire",
      "disassembly": {
        "timeGameMinutes": 8,
        "skill": "mechanics",
        "yields": [{ "item": "scrap_metal", "count": 1, "fractions": [0.5, 1], "rounding": "floor" }]
      }
    },
    {
      "id": "field_patch",
      "name": "Field repair patch",
      "category": "material",
      "model": "field_patch",
      "size": [1, 2],
      "disassembly": {
        "timeGameMinutes": 12,
        "skill": "mechanics",
        "yields": [
          { "item": "copper_wire", "count": 1, "fractions": [0.5, 1], "rounding": "floor" },
          { "item": "duct_tape", "count": 1, "fractions": [0.5, 1], "rounding": "floor" }
        ]
      }
    }
  ],
  "recipes": [
    {
      "id": "torch",
      category: "lighting", tags: ["wood", "textile"], searchTerms: [],
      "result": { "item": "torch", "count": 1 },
      "timeGameMinutes": 20,
      "skills": { "crafting": 0 },
      "qualities": { "cutting": 1 },
      "components": [
        [{ "item": "stick", "count": 1 }],
        [{ "item": "rag", "count": 2 }],
        [{ "item": "wax", "count": 1 }]
      ]
    },
    {
      "id": "make_bandage",
      category: "supplies", tags: ["textile"], searchTerms: [],
      "result": { "item": "bandage", "count": 1 },
      "timeGameMinutes": 5,
      "skills": { "crafting": 0 },
      "qualities": {},
      "components": [[{ "item": "cloth_strip", "count": 2 }]]
    },
    {
      "id": "make_headlamp_strap",
      category: "lighting", tags: ["textile"], searchTerms: [],
      "consumeFitted": true,
      "result": { "item": "headlamp", "count": 1 },
      "timeGameMinutes": 10,
      "skills": { "crafting": 0 },
      "qualities": {},
      "components": [
        [{ "item": "flashlight", "count": 1 }],
        [{ "item": "cloth_strip", "count": 1 }],
        [{ "item": "duct_tape", "count": 1 }]
      ]
    },
    {
      "id": "make_nail_bat",
      category: "tools", tags: ["wood", "metal"], searchTerms: [],
      "result": { "item": "nail_bat", "count": 1 },
      "timeGameMinutes": 15,
      "skills": { "crafting": 0 },
      "qualities": { "hammering": 1 },
      "components": [
        [{ "item": "baseball_bat", "count": 1 }],
        [{ "item": "nails", "count": 12 }]
      ]
    },
    {
      "id": "make_spear",
      category: "tools", tags: ["wood", "textile"], searchTerms: [],
      "result": { "item": "spear", "count": 1 },
      "timeGameMinutes": 20,
      "skills": { "crafting": 0 },
      "qualities": {},
      "components": [
        [{ "item": "stick", "count": 1 }, { "item": "wooden_plank", "count": 1 }],
        [{ "item": "kitchen_knife", "count": 1 }, { "item": "glass_shards", "count": 2 }],
        [{ "item": "nylon_cord", "count": 1 }, { "item": "duct_tape", "count": 1 }]
      ]
    },
    {
      "id": "make_taped_armour",
      category: "supplies", tags: ["textile"], searchTerms: [],
      "result": { "item": "taped_armour", "count": 1 },
      "timeGameMinutes": 30,
      "skills": { "crafting": 0 },
      "qualities": {},
      "components": [
        [{ "item": "paperback", "count": 4 }],
        [{ "item": "duct_tape", "count": 2 }]
      ]
    },
    {
      "id": "candle",
      category: "lighting", tags: [], searchTerms: [],
      "result": { "item": "candle", "count": 1 },
      "timeGameMinutes": 10,
      "skills": { "crafting": 0 },
      "qualities": { "cutting": 1 },
      "components": [[{ "item": "wax", "count": 2 }], [{ "item": "rag", "count": 1 }]],
      "workstation": null
    },
    {
      "id": "repair_kit",
      category: "tools", tags: ["metal", "textile"], searchTerms: [],
      "result": { "item": "repair_kit", "count": 1 },
      "timeGameMinutes": 30,
      "skills": { "crafting": 1 },
      "qualities": { "hammering": 1 },
      "components": [
        [{ "item": "scrap_metal", "count": 2 }],
        [{ "item": "duct_tape", "count": 1 }],
        [{ "item": "rag", "count": 2 }]
      ]
    },
    {
      "id": "strip_wire",
      category: "materials", tags: ["electrical", "metal"], searchTerms: ["strip"],
      "result": { "item": "copper_wire", "count": 1 },
      "timeGameMinutes": 8,
      "skills": { "mechanics": 0 },
      "qualities": { "cutting": 1 },
      "components": [[{ "item": "scrap_metal", "count": 1 }]]
    },
    {
      "id": "field_patch",
      category: "materials", tags: ["electrical"], searchTerms: [],
      "result": { "item": "field_patch", "count": 1 },
      "timeGameMinutes": 12,
      "skills": { "mechanics": 2 },
      "qualities": {},
      "components": [[{ "item": "copper_wire", "count": 1 }], [{ "item": "duct_tape", "count": 1 }]]
    },
    {
      "id": "repair_crowbar",
      category: "repair_tools", tags: ["metal"], searchTerms: [],
      "kind": "repair",
      "result": { "item": "crowbar", "count": 1 },
      "repair": { "skill": "crafting", "amount": 0.2, "perSkill": 0.1 },
      "timeGameMinutes": 15,
      "skills": { "crafting": 0 },
      "qualities": { "repairing": 1 },
      "components": [[{ "item": "scrap_metal", "count": 1 }], [{ "item": "duct_tape", "count": 1 }]]
    },
    {
      "id": "sawn_plank",
      category: "materials", tags: ["wood"], searchTerms: ["saw"],
      "result": { "item": "wooden_plank", "count": 1 },
      "timeGameMinutes": 4,
      "skills": { "crafting": 0 },
      "qualities": { "sawing": 1 },
      "components": [[{ "item": "stick", "count": 2 }]],
      "workstation": "workbench"
    },
    {
      "id": "door_bar",
      category: "fixtures", tags: ["wood"], searchTerms: [],
      "result": { "item": "door_bar", "count": 1 },
      "timeGameMinutes": 10,
      "skills": { "crafting": 0 },
      "qualities": { "sawing": 1 },
      "components": [[{ "item": "wooden_plank", "count": 2 }]],
      "workstation": "workbench"
    }
  ] + sharpenRecipes
}
