// Every wearing blade gets one repair per sharpening method: the wheel restores more in less time, so keeping an edge
// is a choice between a trip to the wheel and a stone carried in the field.
local sharpening = [
  { prefix: 'grind_', qualities: {}, workstation: 'grinding_wheel', amount: 0.5, timeGameMinutes: 10 },
  { prefix: 'hone_', qualities: { sharpening: 1 }, workstation: null, amount: 0.2, timeGameMinutes: 20 },
];
local blades = [
  item.id
  for item in (import 'items-tools.libsonnet').items
  if std.objectHas(item, 'weapon') && item.weapon.melee.type == 'cut' && std.objectHas(item.weapon.melee, 'wearPerHit')
];
local sharpen(blade, method) = {
  id: method.prefix + blade,
  category: 'repair_tools',
  tags: ['edge'],
  searchTerms: [],
  kind: 'repair',
  activation: 'sharpen',
  result: { item: blade, count: 1 },
  repair: { skill: 'crafting', amount: method.amount, perSkill: 0.05 },
  timeGameMinutes: method.timeGameMinutes,
  skills: { crafting: 0 },
  qualities: method.qualities,
  components: [],
  workstation: method.workstation,
};
local sharpenRecipes = [sharpen(blade, method) for blade in blades for method in sharpening];
local skillCurve = { saturationFloor: 0.42, saturationHalfLifeLevels: 4 };
{
  "skills": [skill + { curve: skillCurve } for skill in [
    {
      "id": "crafting",
      "name": "Crafting",
      "startingRecipes": ["torch", "candle", "repair_kit", "repair_crowbar", "sawn_plank", "door_bar", "make_rope"] + [recipe.id for recipe in sharpenRecipes],
      "training": { "craftingTierOffset": 1 },
    },
    { "id": "mechanics", "name": "Mechanics" },
    {
      "id": "inventory_management",
      "name": "Inventory Management (IM)",
      "training": { "activities": { "handling": { "practice": 2.5 } } },
      "inventory": {
        "handlingFactorFloor": 0,
        "handlingFactorHalfLifeLevels": 1.1,
        "handlingPerCellSimSeconds": 0.05,
        "handlingGroundSimSeconds": 1,
        "handlingWearSimSeconds": 2
      }
    },
    {
      "id": "firearms_combat",
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
          "longGunSteadinessSkill": "sniping",
          "raiseMinimumSimSeconds": 0.28,
          "raiseRangeSimSeconds": 0.42,
          "raiseHalfLifeLevels": 5,
          "adsAcquisitionMaximumSimSeconds": 0.55,
          "readyMovementMinimum": 0.45,
          "readyMovementRange": 0.35,
          "readyMovementHalfLifeLevels": 5,
          "loweredPitchRadians": 0.3,
          "skillZeroHandling": {
            "singleShot": { "variance": 20, "recoilKickScale": 6, "recoilRecoveryScale": 0.5 },
            "automaticFollowup": { "variance": 40, "recoilKickScale": 12, "recoilRecoveryScale": 0.25 }
          },
          "wobbleSkillTenVariance": 0.05,
          "wobbleLimitRadians": 0.14,
          "wobbleVerticalToHorizontalRatio": 0.225,
          "wobbleLuneArchPower": 2,
          "wobbleLunePhaseOffsetRadians": 0.08,
          "wobbleNoiseReversionRatePerSimSecond": 2.4,
          "wobbleNoiseSigmaRadiansPerSqrtSecond": 0.002,
          "wobbleNoiseSmoothingSimSeconds": 0.12,
          "wobbleStanceDriftScale": {
            "standing": 1,
            "crouching": 0.8,
            "prone": 0.6,
          },
          "reloadFactorFloor": 0.025,
          "reloadFactorHalfLifeLevels": 5,
          "rackFactorFloor": 0.16,
          "rackFactorHalfLifeLevels": 3,
          "attachmentFactorFloor": 0,
          "attachmentFactorHalfLifeLevels": 1.1,
          "caseEjection": { "speedMetresPerSimSecond": 3.5, "flightSimSeconds": 0.48, "landingLiftMetres": 0.006 },
          "shotTraceRangeBlocks": 240,
          "breathHold": {
            "staminaPerSimSecond": 12,
            "recoverySimSeconds": 3,
            "recoverySwayScale": 2.5,
            "steadyingMinimum": 0.5,
            "steadyingSkillRange": 0.4,
            "steadyingSkillHalfLifeLevels": 5,
            "painWeakeningPerRatio": 0.5
          }
        }
      }
    },
    {
      "id": "sniping",
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
      "id": "melee_combat",
      "name": "Melee Combat (MC)",
      "training": {
        "activities": {
          "block": { "practice": 0.2, "tier": 5 },
          "hit": { "practice": 1, "tier": 5 }
        }
      },
      "combat": {
        "melee": {
          "blockChanceMinimum": 0.05,
          "blockChanceRange": 0.45,
          "blockChanceHalfLifeLevels": 4,
          "mitigationMinimum": 0.3,
          "mitigationRange": 0.55,
          "mitigationHalfLifeLevels": 3,
          "staminaPerAbsorbedPoint": 2,
          "staminaCostFloor": 0.35,
          "staminaCostHalfLifeLevels": 3,
          "joltPerAbsorbedPoint": 0.08,
          "joltRealSeconds": 0.08,
          "deflectRiseMetres": 0.14,
          "deflectRiseFloor": 0.6,
          "deflectRealSeconds": 0.35
        }
      }
    }
  ]],
  "recipeCategories": [
    { id: 'supplies', label: 'Supplies', order: 10 },
    { id: 'materials', label: 'Materials', parent: 'supplies', order: 10 },
    { id: 'tools', label: 'Tools and kits', parent: 'supplies', order: 20 },
    { id: 'lighting', label: 'Lighting', parent: 'supplies', order: 30 },
    { id: 'attachments', label: 'Weapon attachments', parent: 'supplies', order: 40 },
    { id: 'fixtures', label: 'Fixtures', order: 20 },
    { id: 'repairs', label: 'Repairs', order: 30 },
    { id: 'repair_tools', label: 'Tools and weapons', parent: 'repairs', order: 10 },
    { id: 'repair_clothing', label: 'Clothing and bags', parent: 'repairs', order: 20 },
    { id: 'repair_electrical', label: 'Electrical equipment', parent: 'repairs', order: 30 },
  ],
  "recipeTags": [
    { id: 'wood', label: 'Wood', searchTerms: ['timber'] },
    { id: 'metal', label: 'Metal', searchTerms: [] },
    { id: 'textile', label: 'Textiles', searchTerms: ['cloth', 'fabric'] },
    { id: 'electrical', label: 'Electrical', searchTerms: ['wiring'] },
    { id: 'edge', label: 'Sharpening', searchTerms: ['blade', 'edge'] },
  ],
  "skillProgression": [{ "id": "core", "practicePerLevel": 10 }],
  "items": [
    { "id": "stick", "name": "Stick", "category": "material", "model": "stick", "size": [1, 4], "stack": 6 },
    { "id": "wax", "name": "Wax lump", "category": "material", "model": "wax", "size": [1, 1], "stack": 10 },
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
      "id": "repair_kit",
      "name": "Repair kit",
      "category": "tool",
      "model": "repair_kit",
      "size": [2, 2],
      "description": "Metal patches, tape and rags for a makeshift repair.",
      "disassembly": {
        "timeGameMinutes": 15,
        "skill": "crafting",
        "yields": [
          { "item": "scrap_metal", "count": 2, "fractions": [0.5, 0.6, 0.7, 0.8, 0.9, 1], "rounding": "floor" },
          { "item": "duct_tape", "count": 1, "fractions": [0.5, 0.6, 0.7, 0.8, 0.9, 1], "rounding": "floor" },
          { "item": "rag", "count": 2, "fractions": [0.5, 0.6, 0.7, 0.8, 0.9, 1], "rounding": "floor" }
        ]
      },
      "tool": { "qualities": { "repairing": 1 } }
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
      category: 'lighting', tags: ['wood', 'textile'], searchTerms: [],
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
      category: 'supplies', tags: ['textile'], searchTerms: [],
      "result": { "item": "bandage", "count": 1 },
      "timeGameMinutes": 5,
      "skills": { "crafting": 0 },
      "qualities": {},
      "components": [[{ "item": "cloth_strip", "count": 2 }]]
    },
    {
      "id": "make_headlamp_strap",
      category: 'lighting', tags: ['textile'], searchTerms: [],
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
      category: 'tools', tags: ['wood', 'metal'], searchTerms: [],
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
      category: 'tools', tags: ['wood', 'textile'], searchTerms: [],
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
      category: 'supplies', tags: ['textile'], searchTerms: [],
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
      category: 'lighting', tags: [], searchTerms: [],
      "result": { "item": "candle", "count": 1 },
      "timeGameMinutes": 10,
      "skills": { "crafting": 0 },
      "qualities": { "cutting": 1 },
      "components": [[{ "item": "wax", "count": 2 }], [{ "item": "rag", "count": 1 }]],
      "workstation": null
    },
    {
      "id": "repair_kit",
      category: 'tools', tags: ['metal', 'textile'], searchTerms: [],
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
      category: 'materials', tags: ['electrical', 'metal'], searchTerms: ['strip'],
      "result": { "item": "copper_wire", "count": 1 },
      "timeGameMinutes": 8,
      "skills": { "mechanics": 0 },
      "qualities": { "cutting": 1 },
      "components": [[{ "item": "scrap_metal", "count": 1 }]]
    },
    {
      "id": "field_patch",
      category: 'materials', tags: ['electrical'], searchTerms: [],
      "result": { "item": "field_patch", "count": 1 },
      "timeGameMinutes": 12,
      "skills": { "mechanics": 2 },
      "qualities": {},
      "components": [[{ "item": "copper_wire", "count": 1 }], [{ "item": "duct_tape", "count": 1 }]]
    },
    {
      "id": "repair_crowbar",
      category: 'repair_tools', tags: ['metal'], searchTerms: [],
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
      category: 'materials', tags: ['wood'], searchTerms: ['saw'],
      "result": { "item": "wooden_plank", "count": 1 },
      "timeGameMinutes": 4,
      "skills": { "crafting": 0 },
      "qualities": { "sawing": 1 },
      "components": [[{ "item": "stick", "count": 2 }]],
      "workstation": "workbench"
    },
    {
      "id": "door_bar",
      category: 'fixtures', tags: ['wood'], searchTerms: [],
      "result": { "item": "door_bar", "count": 1 },
      "timeGameMinutes": 10,
      "skills": { "crafting": 0 },
      "qualities": { "sawing": 1 },
      "components": [[{ "item": "wooden_plank", "count": 2 }]],
      "workstation": "workbench"
    }
  ] + sharpenRecipes
}
