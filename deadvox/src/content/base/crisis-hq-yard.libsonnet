local context = { usage: ['Military'], tier: 'Tier1' };
local fence = ['############################################################'];
local ground = ['............................................................'];
local front = ['###################LLLLLLRRRRRR#############################'];
local shedFloor = ['##########', '#kkkkkkkk#', '#kkkkkkkk#', '#kkkkkkkk#', '#kkkkkkkk#', '#kkkkkkkk#', '#kkkkkkkk#', '##########'];
local shedLow = ['##########', '#........#', '#.gggg...#', '#.gggg...#', '#.gggg...#', '#........#', '#........#', '####DD####'];
local shedHigh = ['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '####DD####'];
local shedHeads = ['##########', '#........#', '#........#', '#........#', '#........#', '#........#', '#........#', '##########'];
local guardFloor = ['######', '#kkkk#', '#kkkk#', '#kkkk#', '#kkkk#', '######'];
local guardLow = ['######', '#WW..#', '#WW..O', '#WW..O', '#....#', '######'];
local guardHigh = ['#==###', '#....#', '#....O', '#....O', '#....#', '#==###'];
local guardOpen = ['#..###', '#....#', '#....O', '#....O', '#....#', '#..###'];
local guardHeads = ['######', '#....#', '#....#', '#....#', '#....#', '######'];
local palette = {
  '.': 'air', '#': 'concrete', k: 'concrete', '=': 'window_frame',
  D: { furniture: 'wood_door' }, O: { furniture: 'wood_door', facing: 'e' },
  g: { furniture: 'hq_generator', facing: 's' },
  W: { furniture: 'desk', facing: 'e', loot: 'desk' },
};
{
  templates: [
    {
      id: 'crisis_hq_wall', size: [60, 6, 1], lootContext: context,
      palette: { '.': { ground: true }, '#': 'concrete' }, layers: [ground, fence, fence, fence, fence, fence],
    },
    {
      id: 'crisis_hq_side', size: [58, 6, 1], lootContext: context,
      palette: { '.': { ground: true }, '#': 'concrete' },
      layers: [
        ['..........................................................'],
        ['##########################################################'],
        ['##########################################################'],
        ['##########################################################'],
        ['##########################################################'],
        ['##########################################################'],
      ],
    },
    {
      id: 'crisis_hq_front', size: [60, 6, 1], lootContext: context,
      palette: {
        '.': { ground: true }, '#': 'concrete',
        L: { furniture: 'camp_gate_leaf', facing: 'n' },
        R: { furniture: 'camp_gate_leaf', facing: 's' },
      },
      layers: [ground, front, front, front, front, front],
    },
    {
      id: 'crisis_hq_generator_shed', size: [10, 8, 8], lootContext: context, palette: palette,
      layers: [shedFloor, shedLow, shedLow, shedLow, shedHigh, shedHeads, shedHeads, shedFloor],
      access: { ground: 'ground', entrance: [4, 1, 6], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
    },
    {
      id: 'crisis_hq_guard_post', size: [6, 8, 6], lootContext: context, palette: palette,
      layers: [guardFloor, guardLow, guardLow, guardHigh, guardOpen, guardHeads, guardHeads, guardFloor],
      access: { ground: 'ground', entrance: [5, 1, 3], storeys: [{ id: 'ground', floor: 1 }], stairs: [] },
    },
    {
      id: 'crisis_hq_parking', size: [6, 1, 12], lootContext: context,
      palette: { k: 'asphalt', w: 'plaster' },
      layers: [[
        'wwwwww', 'wkkkkw', 'wkkkkw', 'wkkkkw', 'wkkkkw', 'wkkkkw',
        'wkkkkw', 'wkkkkw', 'wkkkkw', 'wkkkkw', 'wkkkkw', 'wwwwww',
      ]],
    },
  ],
  buildings: [
    { template: 'crisis_hq_wall', position: [48, 21, 48], rotation: 0 },
    { template: 'crisis_hq_side', position: [48, 21, 48.5], rotation: 90 },
    { template: 'crisis_hq_side', position: [77.5, 21, 48.5], rotation: 90 },
    { template: 'crisis_hq_front', position: [48, 21, 77.5], rotation: 0 },
    { template: 'crisis_hq_generator_shed', position: [71, 21, 51], rotation: 0 },
    { template: 'crisis_hq_guard_post', position: [50, 21, 73], rotation: 0 },
    { template: 'crisis_hq_parking', position: [71.5, 21, 59], rotation: 0 },
    { template: 'crisis_hq_parking', position: [71.5, 21, 66], rotation: 0 },
  ],
}
