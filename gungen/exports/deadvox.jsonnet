local grains = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local design(id, source) = { id: id, kind: 'design', source: 'gungen/designs/' + source + '.json' };
// Voxelizing at export is an evaluation: a gun is not a vehicle or furniture part, so it takes the item grain.
local voxelDesign(id, source) = design(id, source) { options: { voxelGrain: grains.item } };
local cartridge(id, source, component) = {
  id: id, kind: 'cartridge', source: 'gungen/cartridges/' + source + '.json', options: { component: component },
};
local attachment(source) = { id: std.strReplace(source, '-', '_'), kind: 'attachment', source: source };
local magazine(id, source, calibre, appearanceProfile) = {
  id: id, kind: 'magazine', source: source,
  options: { cartridge: 'gungen/cartridges/' + calibre + '.json', appearanceProfile: appearanceProfile },
};
[
  design('rifle_assault', 'archetype-ar'),
  voxelDesign('rifle_ak', 'archetype-ak-akm'),
  design('shotgun_pump', 'archetype-pump-shotgun'),
  design('rifle_hunting', 'hunting-rifle'),
  design('revolver', 'archetype-revolver'),
  cartridge('round_5_d_56x45', '5.56x45', 'round'),
  cartridge('case_5_d_56x45', '5.56x45', 'case'),
  cartridge('round_7_d_62x39', '7.62x39', 'round'),
  cartridge('case_7_d_62x39', '7.62x39', 'case'),
  cartridge('round_12_h_gauge_h_00_h_buck', '12-gauge-00-buck', 'round'),
  cartridge('case_12_h_gauge_h_00_h_buck', '12-gauge-00-buck', 'case'),
  cartridge('round_308_h_winchester', '308-winchester', 'round'),
  cartridge('case_308_h_winchester', '308-winchester', 'case'),
  cartridge('round_357_h_magnum', '357-magnum', 'round'),
  cartridge('case_357_h_magnum', '357-magnum', 'case'),
  attachment('foregrip'),
  attachment('improvised-suppressor'),
  attachment('optic-digital-thermal'),
  attachment('optic-fixed-prism-4x'),
  attachment('optic-high-mag-5-25x'),
  attachment('optic-holographic'),
  attachment('optic-hunting-3-9x'),
  attachment('optic-lpvo-1-6x'),
  attachment('optic-mini-reflex'),
  attachment('optic-tube-dot'),
  attachment('rail-front-sight'),
  attachment('real-suppressor'),
  attachment('tactical-flashlight-mount'),
  magazine('magazine_stanag_20', 'stanag-20', '5.56x45', 'ar'),
  magazine('magazine_stanag_30', 'stanag-30', '5.56x45', 'ar'),
  magazine('magazine_akm_30', 'akm-30', '7.62x39', 'ak'),
]
