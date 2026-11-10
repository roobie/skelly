local shape = import 'tools/jsonnet/lib/furniture-shape.libsonnet';
local breach = import 'tools/jsonnet/lib/furniture-breach.libsonnet';
breach.breaking(shape.colliding({
  "furniture": [
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
      "appearance": { "kind": "rack", "surface": "wood" },
      "container": {
        "pockets": [
          {
            "grid": [10, 18],
            "handlingSimSeconds": 1.0
          }
        ]
      }
    },
  ]
}))
