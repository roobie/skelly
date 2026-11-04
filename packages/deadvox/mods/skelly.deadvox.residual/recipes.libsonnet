local skillCurve = import 'tools/jsonnet/lib/skill-curve.libsonnet';
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
  ]],
  "items": [
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
    }
  ]
}
