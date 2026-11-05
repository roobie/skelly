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
    }
  ]
}
