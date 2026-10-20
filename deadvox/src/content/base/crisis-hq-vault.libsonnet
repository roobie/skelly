local context = { usage: ['Military'], tier: 'Tier2' };
local floor = [
  '###############',
  '#kkkkkkkkkkkkk#',
  '#kkkkkkkkkkkkk#',
  '#kkkkkkkkkkkkk#',
  '#kkkkkkkkkkkkk#',
  '#kkkkkkkkkkkkk#',
  '#kkkkkkkkkkkkk#',
  '###############',
];
local furnished = [
  '#.....VV......#',
  '#AA...........#',
  '#AA...........#',
  '#AA...........#',
  '#CC...........#',
  '#CC...........#',
  '#CC...........#',
  '###############',
];
local cabinetTops = [
  '#.............#',
  '#AA...........#',
  '#AA...........#',
  '#AA...........#',
  '#CC...........#',
  '#CC...........#',
  '#CC...........#',
  '###############',
];
local shell = [
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '#.............#',
  '###############',
];
{
  template: {
    id: 'crisis_hq_vault', size: [15, 8, 8], lootContext: context,
    palette: {
      '.': 'air', '#': 'concrete', k: 'concrete',
      A: { furniture: 'hq_weapon_cabinet', facing: 'e', loot: 'gauntlet_police_sidearms' },
      C: { furniture: 'hq_weapon_cabinet', facing: 'e', loot: 'gauntlet_police_sidearms' },
      V: { furniture: 'wardrobe', facing: 's', loot: 'gauntlet_police_gear' },
    },
    layers: [floor, furnished, furnished, furnished, furnished, cabinetTops, shell, floor],
    access: { ground: 'ground', entrance: [12, 1, 1], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
  },
  building: { template: 'crisis_hq_vault', position: [51, 21, 64], rotation: 0 },
}
