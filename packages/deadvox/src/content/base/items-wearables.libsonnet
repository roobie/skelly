local worn(model, frame, covers) = {
  model: model, frame: frame, covers: covers,
  pivot: [0, 0, 0], at: [0, 0, 0], turn: [0, 0, 0],
};
local pair(model, left, right, covers) = [worn(model, left, covers), worn(model, right, covers)];
// Worn carry and armour models are authored in the bust's frame, so they sit on the torso frame as drawn.
local onTorso(model) = [{ model: model, overTorso: { jacket: model + '_jacket' }, frame: 'torso', pivot: [0, 0, 0], at: [0, 0, 0], turn: [0, 0, 0] }];
{
  "items": [
    {
      "id": "jeans",
      "name": "Jeans",
      "category": "clothing",
      "model": "jeans",
      figureModels: [worn('worn_trousers_pelvis', 'clothing_body', ['pelvis'])]
        + pair('worn_trousers_thigh', 'left_trouser', 'right_trouser', ['thigh'])
        + pair('worn_trousers_shin', 'left_hem', 'right_hem', ['shin']),
      "size": [3, 3],
      "wearable": {
        "slot": "legs",
        "encumbrance": 10,
        "warmth": 10,
        "wearPerDamage": 0.0012
      },
      "container": {
        "pockets": [
          { "name": "front left", "grid": [1, 2], "handlingSimSeconds": 0.5 },
          { "name": "front right", "grid": [1, 2], "handlingSimSeconds": 0.5 },
          { "name": "back left", "grid": [1, 2], "handlingSimSeconds": 0.6 },
          { "name": "back right", "grid": [1, 2], "handlingSimSeconds": 0.6 }
        ]
      }
    },
    {
      "id": "rubber_boots",
      "name": "Rubber boots",
      "category": "clothing",
      "model": "rubber_boots",
      figureModels: pair('worn_boot_shaft', 'left_hem', 'right_hem', ['shin'])
        + pair('worn_boot_foot', 'left_boot', 'right_boot', ['foot']),
      "size": [2, 3],
      "wearable": {
        "slot": "feet",
        "encumbrance": 8,
        "warmth": 5,
        "wearPerDamage": 0.0012,
        "imperviousTo": ["acid"]
      }
    },
    {
      "id": "cargo_pants",
      "name": "Cargo pants",
      "category": "clothing",
      "model": "cargo_pants",
      "size": [3, 3],
      "wearable": {
        "slot": "legs",
        "encumbrance": 12,
        "warmth": 12,
        "wearPerDamage": 0.0012
      },
      "container": {
        "pockets": [
          { "name": "front left", "grid": [1, 2], "handlingSimSeconds": 0.5 },
          { "name": "front right", "grid": [1, 2], "handlingSimSeconds": 0.5 },
          { "name": "cargo left", "grid": [2, 2], "handlingSimSeconds": 0.8 },
          { "name": "cargo right", "grid": [2, 2], "handlingSimSeconds": 0.8 }
        ]
      }
    },
    {
      "id": "hoodie",
      "name": "Hoodie",
      "category": "clothing",
      "model": "hoodie",
      "size": [3, 3],
      "wearable": {
        "slot": "torso",
        "encumbrance": 8,
        "warmth": 25,
        "wearPerDamage": 0.0015
      },
      "container": { "pockets": [{ "name": "front", "grid": [3, 2], "handlingSimSeconds": 0.5 }] }
    },
    {
      "id": "jacket",
      "name": "Jacket",
      "category": "clothing",
      "model": "jacket",
      figureModels: [worn('worn_jacket_body', 'clothing_body', ['torso'])]
        + pair('worn_jacket_upper', 'left_sleeve', 'right_sleeve', ['upper'])
        + pair('worn_jacket_fore', 'left_cuff', 'right_cuff', ['fore']),
      "size": [3, 3],
      "wearable": {
        "slot": "torso",
        figureFit: 'jacket',
        "encumbrance": 12,
        "warmth": 35,
        "wearPerDamage": 0.001
      },
      "container": {
        "pockets": [
          { "name": "left", "grid": [2, 2], "handlingSimSeconds": 0.5 },
          { "name": "right", "grid": [2, 2], "handlingSimSeconds": 0.5 },
          { "name": "inner", "grid": [1, 2], "handlingSimSeconds": 0.7 }
        ]
      }
    },
    {
      "id": "utility_vest",
      "name": "Utility vest",
      "category": "clothing",
      "model": "utility_vest",
      "figureModels": onTorso('utility_vest_worn'),
      "size": [3, 3],
      "wearable": {
        "slot": "vest",
        "encumbrance": 6,
        "warmth": 5,
        "wearPerDamage": 0.002
      },
      "container": {
        "pockets": [
          { "name": "pouch 1", "grid": [1, 2], "handlingSimSeconds": 0.5 },
          { "name": "pouch 2", "grid": [1, 2], "handlingSimSeconds": 0.5 },
          { "name": "pouch 3", "grid": [1, 2], "handlingSimSeconds": 0.5 },
          { "name": "pouch 4", "grid": [1, 2], "handlingSimSeconds": 0.5 }
        ]
      }
    },
    {
      "id": "stab_vest",
      "name": "Stab vest",
      "model": "stab_vest",
      "figureModels": onTorso('stab_vest_worn'),
      "category": "clothing",
      "weight": 2500,
      "size": [3, 3],
      "wearable": {
        "slot": "vest",
        "encumbrance": 8,
        "warmth": 3,
        "wearPerDamage": 0.001,
        "protects": { "cut": 0.8, "pierce": 0.7, "blunt": 0.1, "acid": 0 }
      }
    },
    {
      "id": "riot_helmet",
      "name": "Riot helmet",
      "model": "riot_helmet",
      "category": "clothing",
      "size": [2, 2],
      "figureModels": [{ "model": "riot_helmet", "frame": "head", "pivot": [0, 0, 0], "at": [0, 0, 0], "turn": [0, 180, 0] }],
      "wearable": {
        "slot": "head",
        "encumbrance": 3,
        "viewModel": { "model": "riot_helmet_view", "tint": 0.035, "darkening": 0.85 },
        "warmth": 1,
        "wearPerDamage": 0.0015,
        "protects": { "blunt": 0.6, "cut": 0.6, "pierce": 0.5, "acid": 0.3 }
      }
    },
    {
      "id": "fanny_pack",
      "name": "Fanny pack",
      "category": "bag",
      "model": "fanny_pack",
      "figureModels": onTorso('fanny_pack_worn'),
      "size": [2, 2],
      "wearable": { "slot": "waist", "encumbrance": 3 },
      "container": { "pockets": [{ "grid": [3, 2], "handlingSimSeconds": 0.8 }] }
    },
    {
      "id": "school_backpack",
      "name": "School backpack",
      "category": "bag",
      "model": "school_backpack",
      "figureModels": onTorso('school_backpack_worn'),
      "size": [4, 4],
      "wearable": { "slot": "back", "encumbrance": 10 },
      "container": {
        "pockets": [
          { "name": "main", "grid": [5, 6], "handlingSimSeconds": 1.5 },
          { "name": "front", "grid": [3, 2], "handlingSimSeconds": 1.2 }
        ]
      }
    },
    {
      "id": "hiking_backpack",
      "name": "Hiking backpack",
      "category": "bag",
      "model": "hiking_backpack",
      "figureModels": onTorso('hiking_backpack_worn'),
      "size": [4, 5],
      "wearable": { "slot": "back", "encumbrance": 12 },
      "container": {
        "pockets": [
          { "name": "main", "grid": [6, 8], "handlingSimSeconds": 1.5 },
          { "name": "lid", "grid": [3, 2], "handlingSimSeconds": 1.0 }
        ]
      }
    }
  ]
}
