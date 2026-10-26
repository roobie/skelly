local rgb(hex) = local n = std.parseHex(hex); [std.floor(n / 65536) / 255, (std.floor(n / 256) % 256) / 255, (n % 256) / 255];
local finish(furniture, metal, accent='rubber-black') = { furniture: furniture, metal: metal, accent: accent };
local roles = {
  receiver: ['metal', 1], 'ak-receiver': ['metal', 0.93],
  'bolt-carrier': ['metal', 0.78], 'ar-charging-handle': ['metal', 0.78],
  'bolt-handle': ['metal', 0.78], 'bolt-handle-arm': ['metal', 0.78], 'bolt-handle-knob': ['metal', 0.78],
  'smg-handle': ['metal', 0.78], lower: ['metal', 0.83], barrel: ['metal', 0.67],
  'ak-muzzle-device': ['metal', 0.67], 'ak-rear-sight': ['metal', 0.65], 'tube-magazine': ['metal', 0.72],
  forend: ['furniture', 0.95], handguard: ['furniture', 0.9], grip: ['furniture', 0.82],
  magazine: ['metal', 0.48], stock: ['furniture', 1], sight: ['metal', 0.62], suppressor: ['metal', 0.55],
  'tactical-flashlight-mount': ['metal', 0.65], foregrip: ['furniture', 0.82],
  frame: ['metal', 0.78], slide: ['metal', 1], cylinder: ['metal', 0.8],
  'front-sight': ['metal', 0.6], 'front-sight-bead': ['metal', 0.6], 'rail-front-sight': ['metal', 0.62],
  'sporting-rear-sight': ['metal', 0.62], 'gas-block': ['metal', 0.55], 'gas-cylinder': ['metal', 0.7],
  'revolver-frame': ['metal', 1], 'revolver-cylinder': ['metal', 0.8], 'revolver-crane': ['metal', 0.8],
  'revolver-ejector': ['metal', 0.8], 'revolver-hammer': ['metal', 1], 'revolver-trigger': ['metal', 1],
  'revolver-barrel': ['metal', 0.67], 'revolver-grip': ['furniture', 0.82],
  'muzzle-brake': ['metal', 0.55], 'barrel-shroud': ['metal', 0.9], bipod: ['metal', 0.7],
  'carry-handle': ['metal', 0.75], 'handle-trunnion': ['metal', 0.75], 'handle-strut': ['metal', 0.75],
  'handle-bar': ['metal', 0.75], monopod: ['metal', 0.7], 'recoil-stock': ['furniture', 1],
  'heavy-receiver': ['metal', 1], 'heavy-lower': ['metal', 0.83], 'heavy-magazine': ['metal', 0.48],
  'heavy-bolt-carrier': ['metal', 0.78],
};
local slots = [['metal', 'steel-parkerized'], ['furniture', 'polymer-black'], ['accent', 'rubber-black']];
local slotMaterials = { [slot[0]]: slot[1] for slot in slots };
local roleMaterials = { sight: 'alu-anodized-black', 'tactical-flashlight-mount': 'alu-anodized-black', suppressor: 'steel-stainless' };
local materials = import '../../../thing-core/src/materials.jsonnet';
local opticLenses = {
  'mini-reflex': 'glass-lens-amber', 'tube-dot': 'glass-lens-amber', holographic: 'glass-lens-amber',
  'fixed-prism-4x': 'glass-lens-green', 'lpvo-1-6x': 'glass-lens-green', 'hunting-3-9x': 'glass-lens-green',
  'high-mag-5-25x': 'glass-lens-amber', 'digital-thermal': 'glass-lens-amber',
};
local specialHex = { grip: '46ac8f', 'stock-joint': 'ce9d52', 'fore-stock': 'ce9d52', 'cut-stub': 'ce9d52', 'stock-comb': '648bc4', 'stock-wrist': 'a97cc8' };
local familyHex = {
  receiver: '8d939c', 'bolt-carrier': '6d737c', 'ar-charging-handle': '6d737c', 'bolt-handle': '6d737c',
  'bolt-handle-arm': '6d737c', 'bolt-handle-knob': '6d737c', 'smg-handle': '6d737c', lower: '6f757e',
  barrel: '5d636b', 'ak-muzzle-device': '5d636b', 'tube-magazine': '4d535b', forend: '8a6a52',
  handguard: '74805f', grip: '7d604c', magazine: '566276', stock: '8a6a52', sight: '3f4650',
  suppressor: '4b4f4c', 'tactical-flashlight-mount': '272c31', foregrip: '24292b', frame: '4b4a45',
  slide: '868d97', cylinder: '4a5566', 'revolver-frame': '8d939c', 'revolver-cylinder': '4a5566',
  'revolver-crane': '4a5566', 'revolver-ejector': '4a5566', 'revolver-hammer': '8d939c', 'revolver-trigger': '8d939c',
  'revolver-barrel': '5d636b', 'revolver-grip': '7d604c', 'front-sight': '363d47', 'front-sight-bead': '363d47',
  'rail-front-sight': '363d47', 'sporting-rear-sight': '363d47','gas-block': '2f3238', 'gas-cylinder': '545a63',
  'muzzle-brake': '3b4149', 'barrel-shroud': '7a8088', bipod: '4a4f55', 'carry-handle': '5a6068', monopod: '4a4f55',
};
{
  finishSlots: [slot[0] for slot in slots],
  fixtureProfiles: {
    'archetype-ak': 'ak', 'archetype-ak-akm': 'ak', 'archetype-anti-materiel': 'anti-materiel', 'archetype-ar': 'ar', 'archetype-ar-free-float': 'ar-free-float',
    'archetype-awm': 'awm', 'archetype-battle-rifle': 'battle-rifle', 'archetype-bolt-rifle': 'bolt-rifle',
    'archetype-bolt-rifle-box': 'bolt-rifle-box', 'archetype-pistol': 'pistol',
    'archetype-pump-shotgun': 'pump-shotgun', 'archetype-revolver': 'revolver', 'archetype-smg': 'smg',
  },
  slotMaterials: slotMaterials,
  // Each attachment's authored look: its default appearance and, where its item class grain does not fit it, the voxel
  // grain its export takes. An instance's own finish overrides these slot by slot.
  attachments: {
    // The gun grain, to match the receivers it mounts on; the item grain draws a plain square bar.
    'real-suppressor': { appearance: { finish: { metal: 'alu-anodized-black' } }, voxelGrain: 0.004 },
    'improvised-suppressor': { appearance: { finish: { metal: 'alu-anodized-black' } }, voxelGrain: 0.004 },
    // A 20 mm mount is two item voxels across; the fine grain keeps its clamp and lamp apart.
    'tactical-flashlight-mount': { voxelGrain: 0.002 },
  } + {
    // Each optic's default lens coating fills its lens slot; the tint is the glass material's sheen.
    ['optic-' + optic]: { appearance: { finish: { lens: opticLenses[optic] } } }
    for optic in std.objectFields(opticLenses)
  },
  // Sides of every round optic body and the lenses seated in it.
  opticBodySides: 8,
  gun: {
    familyColors: { [role]: rgb(familyHex[role]) for role in std.objectFields(familyHex) },
    specialColors: { [role]: rgb(specialHex[role]) for role in std.objectFields(specialHex) },
    fallbackColor: rgb('888888'),
    fallbackFinishMaterial: 'steel-parkerized',
    roleSlots: { [role]: roles[role][0] for role in std.objectFields(roles) },
    roleMaterials: { [role]: if std.objectHas(roleMaterials, role) then roleMaterials[role] else slotMaterials[roles[role][0]] for role in std.objectFields(roles) },
    roleShades: { [role]: [roles[role][1], roles[role][1], roles[role][1]] for role in std.objectFields(roles) },
    profileFinishes: {
      ak: finish('wood-walnut', 'steel-blued'), 'pump-shotgun': finish('wood-walnut', 'steel-blued'),
      'hunting-rifle': finish('wood-walnut', 'steel-blued'),
      ar: finish('polymer-black', 'alu-anodized-black'), 'ar-free-float': finish('polymer-black', 'alu-anodized-black'),
      awm: finish('polymer-od-green', 'steel-parkerized'), smg: finish('polymer-black', 'steel-blued'),
      pistol: finish('polymer-black', 'steel-blued'), revolver: finish('wood-walnut', 'steel-stainless'),
      'battle-rifle': finish('wood-walnut', 'steel-parkerized'), 'bolt-rifle': finish('wood-walnut', 'steel-parkerized'),
      'bolt-rifle-box': finish('wood-walnut', 'steel-parkerized'), 'bolt-rifle-thumbhole': finish('wood-walnut', 'steel-parkerized'),
      'anti-materiel': finish('polymer-fde', 'steel-parkerized'),
    },
  },
  ammunition: {
    familyColors: { 'cartridge-model': [0.62, 0.56, 0.43] },
    specialColors: { case: materials.brass.colour, bullet: materials.copper.colour, primer: [0.49, 0.4, 0.23] },
    fallbackColor: [0.62, 0.56, 0.43],
    fallbackFinishMaterial: 'brass',
  },
  cartridgeFinish: { case: 'brass', bullet: 'copper', primer: 'brass', closure: 'paperboard-brown' },
  hullMaterials: { red: 'plastic-red', green: 'plastic-green', blue: 'plastic-blue', black: 'plastic-black', white: 'plastic-white', yellow: 'plastic-yellow' },
}
