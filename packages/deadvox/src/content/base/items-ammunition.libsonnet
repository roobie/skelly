{
  models: [
    import 'gungen/magazine_stanag_30.model.json',
    import 'gungen/magazine_stanag_20.model.json',
    import 'gungen/magazine_akm_30.model.json',
  ],
  "items": [
    {
      id: 'cartridge_308_h_winchester', name: '.308 Winchester cartridge',
      category: 'ammo', weight: 24, size: [1, 1], stack: 20,
      model: 'round_308_h_winchester',
      ammo: {
        calibre: '308-winchester', pellets: 1, spreadDegrees: 0, diameterMm: 7.82,
        damage: 65, impulse: 2.5, rangeMetres: 700, headDamageMultiplier: 2,
        loadSimSeconds: 0.8, stripSimSeconds: 0.5,
      },
    },
    {
      id: 'cartridge_box_308_h_winchester', name: 'Sealed .308 Winchester box (20)',
      category: 'ammo', model: 'cartridge_box_308_h_winchester', size: [2, 1],
      unpack: { item: 'cartridge_308_h_winchester', count: 20, simSeconds: 1.2 },
    },
    {
      id: 'spent_case_308_h_winchester', name: 'Spent .308 Winchester case',
      category: 'misc', weight: 10, size: [1, 1], stack: 50,
      model: 'case_308_h_winchester',
    },
    {
      "id": "cartridge_5_d_56x45",
      "name": "5.56×45 cartridge",
      "category": "ammo",
      "weight": 12,
      "size": [1, 1],
      "stack": 30,
      "description": "A loose 5.56×45 rifle cartridge.",
      "ammo": {
        "calibre": "5.56x45",
        "pellets": 1,
        "spreadDegrees": 0,
        "diameterMm": 5.7,
        "damage": 35,
        "impulse": 1,
        "rangeMetres": 500,
        "headDamageMultiplier": 2,
        "loadSimSeconds": 0.8,
        "stripSimSeconds": 0.5
      },
      "model": "round_5_d_56x45"
    },
    {
      "id": "cartridge_7_d_62x39",
      "name": "7.62×39 cartridge",
      "category": "ammo",
      "weight": 16,
      "size": [1, 1],
      "stack": 30,
      "description": "A loose 7.62×39 rifle cartridge.",
      "ammo": {
        "calibre": "7.62x39",
        "pellets": 1,
        "spreadDegrees": 0,
        "diameterMm": 7.92,
        "damage": 45,
        "impulse": 1.5,
        "rangeMetres": 400,
        "headDamageMultiplier": 2,
        "loadSimSeconds": 0.8,
        "stripSimSeconds": 0.5
      },
      "model": "round_7_d_62x39"
    },
    {
      "id": "cartridge_box_5_d_56x45",
      "name": "Sealed 5.56×45 box (20)",
      "category": "ammo",
      "model": "cartridge_box_5_d_56x45",
      "size": [2, 1],
      "description": "Sealed cardboard box of twenty 5.56×45 cartridges.",
      "unpack": { "item": "cartridge_5_d_56x45", "count": 20, "simSeconds": 1.2 }
    },
    {
      "id": "cartridge_box_7_d_62x39",
      "name": "Sealed 7.62×39 box (20)",
      "category": "ammo",
      "model": "cartridge_box_7_d_62x39",
      "size": [2, 1],
      "description": "Sealed cardboard box of twenty 7.62×39 cartridges.",
      "unpack": { "item": "cartridge_7_d_62x39", "count": 20, "simSeconds": 1.2 }
    },
    {
      "id": "magazine_stanag_30",
      "name": "STANAG magazine",
      "category": "ammo",
      "weight": 117,
      "size": [1, 2],
      "description": "A 30-round 5.56×45 box magazine for AR-pattern rifles.",
      "model": "magazine_stanag_30"
    },
    {
      "id": "magazine_stanag_20",
      "name": "20-round STANAG magazine",
      "category": "ammo",
      "weight": 79,
      "size": [1, 2],
      "description": "A 20-round 5.56×45 straight-body magazine for AR-pattern rifles.",
      "model": "magazine_stanag_20"
    },
    {
      "id": "magazine_akm_30",
      "name": "AKM magazine",
      "category": "ammo",
      "weight": 330,
      "size": [1, 2],
      "description": "A 30-round 7.62×39 steel box magazine for AK-pattern rifles.",
      "model": "magazine_akm_30"
    }
  ]
}
