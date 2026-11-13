// Every wearing blade gets one repair per sharpening method: the wheel restores more in less time, so keeping an edge
// is a choice between a trip to the wheel and a stone carried in the field. Each mod sharpens the blades it holds or
// repairs, so the methods stay one authored value.
local sharpening = [
  { prefix: 'grind_', qualities: {}, workstation: 'grinding_wheel', amount: 0.5, timeGameMinutes: 10 },
  { prefix: 'hone_', qualities: { sharpening: 1 }, workstation: null, amount: 0.2, timeGameMinutes: 20 },
];
local sharpen(blade, method) = {
  id: method.prefix + blade,
  category: 'repair_tools',
  tags: ['edge'],
  searchTerms: [],
  kind: 'repair',
  activation: 'sharpen',
  result: { item: blade, count: 1 },
  repair: { skill: 'crafting', amount: method.amount, perSkill: 0.05 },
  timeGameMinutes: method.timeGameMinutes,
  skills: { crafting: 0 },
  qualities: method.qualities,
  components: [],
  workstation: method.workstation,
};
{
  sharpenRecipes(items):: [
    sharpen(item.id, method)
    for item in items
    if std.objectHas(item, 'weapon') && item.weapon.melee.type == 'cut' && std.objectHas(item.weapon.melee, 'wearPerHit')
    for method in sharpening
  ],
}
