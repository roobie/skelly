{
  "skills": [
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
      }
    },
    {
      "id": "sniping", "capability": "longGunSteadiness",
      "name": "Sniping",
      "detail": "Reduces long-gun sway and look lag. Improves breath steadying with long guns.",
      "training": { "activities": {
        "acquisition": { "practice": 0.1, "tier": 1 },
        "ads": { "practicePerSimSecond": 0.1, "tier": 1 },
        "shot": { "practice": 1, "tier": 3 },
        "hit": { "practice": 1, "tier": 5 },
      } },
    },
  ],
}
