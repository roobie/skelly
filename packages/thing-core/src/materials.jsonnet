local material(colour, densityKgPerM3, source) = {
  colour: colour,
  finish: { metallic: 0, roughness: 0.85 },
  densityKgPerM3: densityKgPerM3,
  source: source,
};
local woodSource = 'https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr190/chapter_05.pdf';
local metalSource = 'https://www.engineeringtoolbox.com/metal-alloys-densities-d_50.html';
local polymer(colour) = material(colour, 1350, 'https://www.matweb.com/search/QuickText.aspx?SearchText=polyamide+66+30%25+glass+fiber');
local hex(n) = [std.floor(n / 65536) / 255, (std.floor(n / 256) % 256) / 255, (n % 256) / 255];
{
  'wood-walnut': material(hex(7684900), 610, woodSource),
  'wood-birch': material(hex(12687973), 670, woodSource),
  'polymer-black': polymer(hex(2369835)),
  'polymer-od-green': polymer(hex(4937782)),
  'polymer-fde': polymer(hex(11637090)),
  'steel-blued': material(hex(4082009), 7850, metalSource),
  'steel-parkerized': material(hex(4935500), 7850, metalSource),
  'steel-stainless': material(hex(11843768), 8000, 'https://www.azom.com/article.aspx?ArticleID=965'),
  'alu-anodized-black': material(hex(2567217), 2700, 'https://www.makeitfrom.com/material-properties/6061-T6-Aluminum'),
  'rubber-black': material(hex(1579547), 1100, 'https://www.engineeringtoolbox.com/density-solids-d_1265.html'),
  brass: material([0.69, 0.51, 0.29], 8500, metalSource),
  copper: material([0.7, 0.34, 0.19], 8960, metalSource),
  lead: material([0.38, 0.4, 0.42], 11340, metalSource),
  steel: material([0.29, 0.32, 0.31], 7850, metalSource),
}
