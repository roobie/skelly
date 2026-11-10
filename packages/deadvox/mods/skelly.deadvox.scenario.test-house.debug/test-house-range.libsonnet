local empty = '..................................................................................';
local ground = 'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG';
local line = 'GGGGGGGGaaGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG';
local nearPostGround = 'GGGGGGGGaaGGGGGGGGGGGGGGGGGGpGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG';
local middlePostGround = 'GGGGGGGGaaGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGpGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG';
local farPostGround = 'GGGGGGGGaaGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGpGGGGGGGGGGGGG';
local nearPost = '............................p.....................................................';
local middlePost = '................................................p.................................';
local farPost = '....................................................................p.............';
local paper = '............................T.....................................................';
local middleEdge = '................................................p.................................';
local middleBull = '................................................b.................................';
local farEdge = '....................................................................p.............';
local farBull = '....................................................................b.............';
local rack = '...RR.............................................................................';
local tableFarEdge = '...tttt.............................................................p.............';
local tableFarBull = '...tttt.............................................................b.............';
local floor = [
  ground, ground, ground, line, line, line, line, line, line, nearPostGround,
  line, line, line, line, line, nearPostGround, line, farPostGround, line, line,
  line, line, line, farPostGround, line, middlePostGround, line, line, line, line,
  line, middlePostGround, line, line, line, line, line, ground, ground, ground,
];
local lower = [
  empty, empty, empty, empty, empty, empty, empty, empty, empty, nearPost,
  paper, paper, paper, paper, paper, nearPost, empty, farPost, farEdge, tableFarEdge,
  tableFarEdge, farEdge, farEdge, farPost, rack, middlePost, middleEdge, middleEdge, middleEdge, middleEdge,
  middleEdge, middlePost, empty, empty, empty, empty, empty, empty, empty, empty,
];
local middle = [
  empty, empty, empty, empty, empty, empty, empty, empty, empty, nearPost,
  paper, paper, paper, paper, paper, nearPost, empty, farPost, farEdge, tableFarBull,
  tableFarBull, farBull, farEdge, farPost, rack, middlePost, middleEdge, middleBull, middleBull, middleBull,
  middleEdge, middlePost, empty, empty, empty, empty, empty, empty, empty, empty,
];
local upperMiddle = [
  empty, empty, empty, empty, empty, empty, empty, empty, empty, nearPost,
  paper, paper, paper, paper, paper, nearPost, empty, farPost, farEdge, farBull,
  farBull, farBull, farEdge, farPost, rack, middlePost, middleEdge, middleBull, middleBull, middleBull,
  middleEdge, middlePost, empty, empty, empty, empty, empty, empty, empty, empty,
];
local upper = [
  empty, empty, empty, empty, empty, empty, empty, empty, empty, empty,
  paper, paper, paper, paper, paper, empty, empty, empty, farEdge, farEdge,
  farEdge, farEdge, farEdge, empty, rack, empty, middleEdge, middleEdge, middleEdge, middleEdge,
  middleEdge, empty, empty, empty, empty, empty, empty, empty, empty, empty,
];
{
  id: 'test_house_range',
  lootContext: { usage: ['Residential'], tier: 'Tier1' },
  size: [82, 5, 40],
  palette: {
    '.': 'air', G: { ground: true }, a: 'asphalt', p: 'planks', b: 'brick',
    R: { furniture: 'range_rack', facing: 's' },
    t: { furniture: 'range_table', facing: 's' },
    T: { furniture: 'range_target', facing: 'n' },
  },
  layers: [floor, lower, middle, upperMiddle, upper],
}
