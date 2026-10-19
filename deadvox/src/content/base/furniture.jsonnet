local shape = import 'furniture-shape.libsonnet';
shape.colliding({
  "furniture": [
    {
      "id": "kitchen_cupboard",
      "name": "Kitchen cupboard",
      "size": [2, 2, 1],
      "color": "#8a6a48",
      "appearance": { "kind": "cabinet", "surface": "wood" },
      "container": {
        "pockets": [
          {
            "grid": [8, 6],
            "handlingSimSeconds": 1.0
          }
        ]
      },
      "loot": "kitchen_cupboard"
    },
    {
      "id": "counter",
      "name": "Kitchen counter",
      "size": [2, 2, 1],
      "color": "#b8b2a6",
      "appearance": { "kind": "drawers", "surface": "plastic" },
      "container": {
        "pockets": [
          {
            "grid": [8, 5],
            "handlingSimSeconds": 1.0
          }
        ]
      },
      "loot": "kitchen_cupboard"
    },
    {
      "id": "fridge",
      "name": "Fridge",
      "size": [2, 4, 2],
      "color": "#d8dcd8",
      "appearance": { "kind": "fridge", "surface": "painted-metal" },
      "upright": true,
      "container": {
        "pockets": [
          {
            "grid": [5, 14],
            "handlingSimSeconds": 1.0
          }
        ]
      },
      "loot": "fridge"
    },
    {
      "id": "wardrobe",
      "name": "Wardrobe",
      "size": [2, 4, 1],
      "color": "#6e5037",
      "appearance": { "kind": "cabinet", "surface": "wood" },
      "container": {
        "pockets": [
          {
            "grid": [9, 18],
            "handlingSimSeconds": 1.2
          }
        ]
      },
      "loot": "wardrobe"
    },
    {
      "id": "desk",
      "name": "Desk",
      "size": [3, 2, 2],
      "color": "#7a5c3e",
      "shape": [
        { "position": [0, 1.7, 0], "size": [3, 0.2, 2], "color": "#8a6a48" },
        { "position": [0.05, 0, 0.1], "size": [1, 1.7, 1.85] },
        { "position": [0.1, 1.2, 0], "size": [0.9, 0.42, 0.1], "color": "#6a4e33" },
        { "position": [0.1, 0.65, 0], "size": [0.9, 0.42, 0.1], "color": "#6a4e33" },
        { "position": [0.1, 0.1, 0], "size": [0.9, 0.42, 0.1], "color": "#6a4e33" },
        { "position": [0.45, 1.38, 0], "size": [0.2, 0.06, 0.1], "color": "#2c2a28" },
        { "position": [0.45, 0.83, 0], "size": [0.2, 0.06, 0.1], "color": "#2c2a28" },
        { "position": [0.45, 0.28, 0], "size": [0.2, 0.06, 0.1], "color": "#2c2a28" },
        { "position": [2.75, 0, 0.1], "size": [0.2, 1.7, 1.85] },
        { "position": [1.05, 0.9, 1.75], "size": [1.7, 0.8, 0.1] }
      ],
      "container": {
        "pockets": [
          {
            "grid": [5, 3],
            "handlingSimSeconds": 1.0
          }
        ]
      },
      "loot": "desk"
    },
    {
      "id": "range_table",
      "name": "Simple wooden table",
      "size": [4, 2, 2],
      "color": "#786b55",
      "shape": [
        { "position": [0.14, 0, 0.14], "size": [0.16, 1.65, 0.16] },
        { "position": [3.7, 0, 0.14], "size": [0.16, 1.65, 0.16] },
        { "position": [0.14, 0, 1.7], "size": [0.16, 1.65, 0.16] },
        { "position": [3.7, 0, 1.7], "size": [0.16, 1.65, 0.16] },
        { "position": [0.05, 1.65, 0.05], "size": [3.9, 0.2, 1.9] }
      ]
    },
    {
      "id": "range_target",
      "name": "Paper target",
      "size": [1, 4, 5],
      "color": "#e9e3cf",
      "shotTarget": true
    },
    {
      "id": "range_rack",
      "name": "Gun rack",
      "size": [2, 4, 1],
      "color": "#494b4e",
      "container": {
        "pockets": [
          {
            "grid": [10, 18],
            "handlingSimSeconds": 1.0
          }
        ]
      }
    },
    {
      "id": "shelf",
      "name": "Shelf",
      "size": [2, 4, 1],
      "color": "#8d7355",
      "shape": [
        { "position": [0, 0, 0], "size": [0.12, 4, 1] },
        { "position": [1.88, 0, 0], "size": [0.12, 4, 1] },
        { "position": [0.12, 0, 0.88], "size": [1.76, 3.9, 0.12] },
        { "position": [0, 3.88, 0], "size": [2, 0.12, 1] },
        { "position": [0.12, 0.1, 0], "size": [1.76, 0.1, 0.88] },
        { "position": [0.12, 1.0, 0], "size": [1.76, 0.1, 0.88] },
        { "position": [0.12, 1.9, 0], "size": [1.76, 0.1, 0.88] },
        { "position": [0.12, 2.8, 0], "size": [1.76, 0.1, 0.88] }
      ],
      "container": {
        "pockets": [
          {
            "grid": [9, 18],
            "handlingSimSeconds": 0.8
          }
        ]
      },
      "loot": "shelf"
    },
    {
      "id": "workbench",
      "name": "Workbench",
      "size": [3, 2, 2],
      "color": "#98734f",
      "shape": [
        { "position": [0.1, 0, 0.1], "size": [0.2, 1.6, 0.2] },
        { "position": [2.7, 0, 0.1], "size": [0.2, 1.6, 0.2] },
        { "position": [0.1, 0, 1.7], "size": [0.2, 1.6, 0.2] },
        { "position": [2.7, 0, 1.7], "size": [0.2, 1.6, 0.2] },
        { "position": [0.3, 1.3, 0.1], "size": [2.4, 0.25, 0.1] },
        { "position": [0.3, 1.3, 1.8], "size": [2.4, 0.25, 0.1] },
        { "position": [0.3, 0.5, 0.3], "size": [2.4, 0.1, 1.4] },
        { "position": [0, 1.6, 0], "size": [3, 0.3, 2] },
        { "position": [2.4, 1.9, 0.1], "size": [0.4, 0.1, 0.4] }
      ],
      "workstation": {
        "id": "workbench",
        "qualities": { "hammering": 1, "sawing": 1 },
        "workFactorBonus": 0.2
      }
    },
    {
      "id": "crate",
      "name": "Crate",
      "size": [2, 2, 2],
      "color": "#9a7b4f",
      "shape": [
        { "position": [0.1, 0.05, 0.1], "size": [1.8, 1.79, 1.8] },
        { "position": [0, 0, 0], "size": [0.2, 1.84, 0.2] },
        { "position": [1.8, 0, 0], "size": [0.2, 1.84, 0.2] },
        { "position": [0, 0, 1.8], "size": [0.2, 1.84, 0.2] },
        { "position": [1.8, 0, 1.8], "size": [0.2, 1.84, 0.2] },
        { "position": [0.2, 0.1, 0], "size": [1.6, 0.5, 0.1] },
        { "position": [0.2, 0.72, 0], "size": [1.6, 0.5, 0.1] },
        { "position": [0.2, 1.34, 0], "size": [1.6, 0.5, 0.1] },
        { "position": [0.2, 0.1, 1.9], "size": [1.6, 0.5, 0.1] },
        { "position": [0.2, 0.72, 1.9], "size": [1.6, 0.5, 0.1] },
        { "position": [0.2, 1.34, 1.9], "size": [1.6, 0.5, 0.1] },
        { "position": [0, 0.1, 0.2], "size": [0.1, 0.5, 1.6] },
        { "position": [0, 0.72, 0.2], "size": [0.1, 0.5, 1.6] },
        { "position": [0, 1.34, 0.2], "size": [0.1, 0.5, 1.6] },
        { "position": [1.9, 0.1, 0.2], "size": [0.1, 0.5, 1.6] },
        { "position": [1.9, 0.72, 0.2], "size": [0.1, 0.5, 1.6] },
        { "position": [1.9, 1.34, 0.2], "size": [0.1, 0.5, 1.6] },
        { "position": [0, 1.84, 0], "size": [2, 0.16, 2] }
      ],
      "container": {
        "pockets": [
          {
            "grid": [10, 10],
            "handlingSimSeconds": 1.2
          }
        ]
      },
      "loot": "junk"
    },
    {
      "id": "bed",
      "name": "Bed",
      "size": [2, 1, 4],
      "color": "#6f7f95",
      "shape": [
        { "position": [0.05, 0, 0.05], "size": [0.12, 0.2, 0.12], "color": "#5e4630" },
        { "position": [1.83, 0, 0.05], "size": [0.12, 0.2, 0.12], "color": "#5e4630" },
        { "position": [0.05, 0, 3.83], "size": [0.12, 0.2, 0.12], "color": "#5e4630" },
        { "position": [1.83, 0, 3.83], "size": [0.12, 0.2, 0.12], "color": "#5e4630" },
        { "position": [0.05, 0.2, 0.05], "size": [1.9, 0.15, 3.83], "color": "#7a5a3e" },
        { "position": [0.04, 0.2, 3.88], "size": [1.92, 0.8, 0.12], "color": "#6a4d34" },
        { "position": [0.04, 0.2, 0], "size": [1.92, 0.4, 0.1], "color": "#6a4d34" },
        { "position": [0.1, 0.35, 0.1], "size": [1.8, 0.22, 3.78], "color": "#d9d4c6" },
        { "position": [0.08, 0.57, 0.1], "size": [1.84, 0.1, 2.5], "color": "#6f7f95" },
        { "position": [0.2, 0.57, 3.2], "size": [0.75, 0.14, 0.6], "color": "#ece9df" },
        { "position": [1.05, 0.57, 3.2], "size": [0.75, 0.14, 0.6], "color": "#ece9df" }
      ],
      "rest": {
        "quality": 1,
        "sleep": true
      }
    },
    {
      "id": "chair",
      "name": "Chair",
      "size": [1, 2, 1],
      "color": "#8b7355",
      "shape": [
        { "position": [0.12, 0, 0.12], "size": [0.16, 0.92, 0.16] },
        { "position": [0.72, 0, 0.12], "size": [0.16, 0.92, 0.16] },
        { "position": [0.12, 0, 0.72], "size": [0.16, 0.92, 0.16] },
        { "position": [0.72, 0, 0.72], "size": [0.16, 0.92, 0.16] },
        { "position": [0.06, 0.9, 0.06], "size": [0.88, 0.18, 0.88] },
        { "position": [0.06, 1.06, 0.83], "size": [0.88, 0.88, 0.11] }
      ],
      "rest": {
        "quality": 1
      }
    },
    {
      "id": "sofa",
      "name": "Sofa",
      "size": [4, 2, 2],
      "color": "#66776d",
      "shape": [
        { "position": [0.45, 0, 0], "size": [3.1, 0.3, 2] },
        { "position": [0.45, 0.3, 0], "size": [1.52, 0.6, 1.5] },
        { "position": [2.03, 0.3, 0], "size": [1.52, 0.6, 1.5] },
        { "position": [0.45, 0.3, 1.5], "size": [3.1, 1.45, 0.5] },
        { "position": [0, 0, 0], "size": [0.45, 1.2, 2] },
        { "position": [3.55, 0, 0], "size": [0.45, 1.2, 2] }
      ],
      "rest": {
        "quality": 0.5,
        "sleep": true
      }
    },
    {
      "id": "wood_door",
      "name": "Wooden door",
      "size": [2, 4, 1],
      "color": "#7a5534",
      "door": {
        "handlingSimSeconds": 0.6,
        "prying": {
          "quality": 3,
          "skill": "mechanics",
          "timeSimSeconds": 15,
          "fastestTimeSimSeconds": 7.5,
          "strikeIntervalSimSeconds": 0.5
        }
      }
    }
  ]
})
