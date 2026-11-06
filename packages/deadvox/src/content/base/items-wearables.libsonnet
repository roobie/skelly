// Catalogue items worn ahead of the framework refactor (#1532): the draft supplies the item, and
// `packages/thing-authoring-tool/catalogue/worn.libsonnet` its worn look under the draft's model id.
local fitted = import 'packages/thing-authoring-tool/catalogue/worn.libsonnet';
local fromDraft(batch, id, extra={}) =
  local d = [row for row in batch if std.get(row, 'id') == id][0];
  { id: d.id, name: d.name, category: d.category, model: d.model, size: d.size, wearable: d.wearable,
    figureModels: fitted[d.model].figureModels } + extra;
local worn(model, frame, covers) = {
  model: model, frame: frame, covers: covers,
  pivot: [0, 0, 0], at: [0, 0, 0], turn: [0, 0, 0],
};
local pair(model, left, right, covers) = [worn(model, left, covers), worn(model, right, covers)];
// Worn carry and armour models are authored in the bust's frame, so they sit on the torso frame as drawn.
local onTorso(model) = [{ model: model, overTorso: { jacket: model + '_jacket' }, frame: 'torso', pivot: [0, 0, 0], at: [0, 0, 0], turn: [0, 0, 0] }];
local salvage = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local yield(item, count) = { item: item, count: count, fractions: salvage, rounding: 'floor' };
local disassembly(timeGameMinutes, yields) = { timeGameMinutes: timeGameMinutes, skill: 'crafting', yields: yields };
// The plate set shows heavy armour on the figure; where it spawns is not decided, so none does.
local knight = { notLoot: true };
// Heavy trooper armour, likewise shown on the figure with no spawn yet.
local trooper(model, name, size, wearable) = knight + {
  id: model, name: name, category: 'clothing', model: model, size: size, wearable: wearable,
  figureModels: fitted[model].figureModels,
};
{
  "items": [
    fromDraft(import 'things/catalogue-drafts/batch-114.json', 'jacket_leather', { wearable+: { figureFit: 'jacket' } }),
    fromDraft(import 'things/catalogue-drafts/batch-127.json', 'cowboy_hat'),
    fromDraft(import 'things/catalogue-drafts/batch-123.json', 'gloves_leather'),
    fromDraft(import 'things/catalogue-drafts/batch-099.json', 'boots_combat'),
    fromDraft(import 'things/catalogue-drafts/batch-171.json', 'armor_lc_plate', knight),
    fromDraft(import 'things/catalogue-drafts/batch-135.json', 'helmet_plate', knight),
    fromDraft(import 'things/catalogue-drafts/batch-124.json', 'gloves_plate', knight),
    fromDraft(import 'things/catalogue-drafts/batch-102.json', 'lc_sabaton', knight),
    // Deadvox has no shins slot, so the harness takes the legs slot.
    fromDraft(import 'things/catalogue-drafts/batch-150.json', 'legguard_lightplate', knight + { wearable+: { slot: 'legs' } }),
    trooper('armor_trooper', 'Trooper cuirass', [4, 5], {
      slot: 'vest', encumbrance: 22, warmth: 15, wearPerDamage: 0.0008,
      protects: { blunt: 0.55, cut: 0.8, pierce: 0.7, acid: 0.2 },
    }),
    trooper('helmet_trooper', 'Trooper helm', [3, 3], {
      slot: 'head', encumbrance: 25, warmth: 10, wearPerDamage: 0.0008,
      protects: { blunt: 0.55, cut: 0.8, pierce: 0.6, acid: 0.4 },
    }),
    trooper('gloves_trooper', 'Trooper gauntlets', [2, 2], {
      slot: 'hands', encumbrance: 15, warmth: 15, wearPerDamage: 0.0008,
      protects: { blunt: 0.4, cut: 0.65, pierce: 0.5, acid: 0.2 },
    }),
    trooper('boots_trooper', 'Trooper boots', [2, 3], {
      slot: 'feet', encumbrance: 10, warmth: 10, wearPerDamage: 0.001,
      protects: { blunt: 0.45, cut: 0.7, pierce: 0.55, acid: 0.3 },
    }),
    trooper('legguard_trooper', 'Trooper leg armour', [4, 4], {
      slot: 'legs', encumbrance: 12, warmth: 15, wearPerDamage: 0.0008,
      protects: { blunt: 0.5, cut: 0.8, pierce: 0.65, acid: 0.2 },
    }),
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
      "id": "sneakers",
      "name": "Sneakers",
      "category": "clothing",
      "model": "sneakers",
      figureModels: pair('worn_sneaker_foot', 'left_boot', 'right_boot', ['foot']),
      "size": [2, 3],
      "wearable": {
        "slot": "feet",
        "encumbrance": 4,
        "warmth": 2,
        "wearPerDamage": 0.0012
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
      figureModels: [worn('worn_hoodie_body', 'clothing_body', ['torso'])]
        + pair('worn_hoodie_upper', 'left_sleeve', 'right_sleeve', ['upper'])
        + pair('worn_hoodie_fore', 'left_cuff', 'right_cuff', ['fore']),
      "size": [3, 3],
      "wearable": {
        "slot": "torso",
        figureFit: 'jacket',
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
      "id": "taped_armour",
      "name": "Taped armour",
      "model": "utility_vest",
      "figureModels": onTorso('utility_vest_worn'),
      "category": "clothing",
      "size": [3, 3],
      "description": "Paperbacks held together with tape.",
      "disassembly": disassembly(15, [yield('paperback', 2), yield('duct_tape', 1)]),
      "wearable": {
        "slot": "vest",
        "encumbrance": 10,
        "warmth": 2,
        "wearPerDamage": 0.003,
        "protects": { "cut": 0.35, "pierce": 0.25, "blunt": 0.05, "acid": 0 }
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
