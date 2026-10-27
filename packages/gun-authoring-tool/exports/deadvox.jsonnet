// A gun and its magazine take the gun class, so a seated magazine matches the receiver's voxels; cartridges and
// attachments are items. A cartridge or attachment may name its own grain in its definition in place of its class's.
local voxel = import 'tools/jsonnet/lib/voxel-grains.libsonnet';
local attachments = (import 'packages/gun-authoring-tool/src/gun/appearance.jsonnet').attachments;
local design(id, source) = { id: id, kind: 'design', source: 'packages/gun-authoring-tool/designs/' + source + '.json', voxel: voxel.gun };
// A cartridge exports as its round and its case, both on the grain its definition names.
local cartridge(name, source, definition) = [
  {
    id: component + '_' + name, kind: 'cartridge', source: 'packages/gun-authoring-tool/cartridges/' + source + '.json',
    voxel: voxel.of(voxel.item, definition), options: { component: component },
  }
  for component in ['round', 'case']
];
local attachment(source) = {
  id: std.strReplace(source, '-', '_'), kind: 'attachment', source: source,
  voxel: voxel.of(voxel.item, std.get(attachments, source, {})),
};
local attachmentSources = [
  'ak-slant-compensator',
  'foregrip',
  'improvised-suppressor',
  'optic-digital-thermal',
  'optic-fixed-prism-4x',
  'optic-high-mag-5-25x',
  'optic-holographic',
  'optic-hunting-3-9x',
  'optic-lpvo-1-6x',
  'optic-mini-reflex',
  'optic-tube-dot',
  'rail-front-sight',
  'real-suppressor',
  'tactical-flashlight-mount',
];
// A look for an attachment no row exports is a misspelt id, not an unused entry.
local strays = std.setDiff(std.objectFields(attachments), std.set(attachmentSources));
assert std.length(strays) == 0 : 'attachment looks with no export row: %s' % [strays];
// Every catalogue item exports as its loose part, on the gun class so it matches the gun it is fitted to.
local partItems = [entry for entry in (import 'packages/gun-authoring-tool/src/gun/catalogue.jsonnet').parts if std.objectHas(entry, 'params')];
local part(item) = { id: item.id, kind: 'part', source: item.id, voxel: voxel.gun };
local magazine(id, source, calibre, appearanceProfile) = {
  id: id, kind: 'magazine', source: source, voxel: voxel.gun,
  options: { cartridge: 'packages/gun-authoring-tool/cartridges/' + calibre + '.json', appearanceProfile: appearanceProfile },
};
[
  design('rifle_assault', 'archetype-ar'),
  design('rifle_ak', 'archetype-ak-akm'),
  design('shotgun_pump', 'archetype-pump-shotgun'),
  design('rifle_hunting', 'hunting-rifle'),
  design('revolver', 'archetype-revolver'),
  design('pistol_service', 'service-nine'),
]
+ cartridge('5_d_56x45', '5.56x45', import 'packages/gun-authoring-tool/cartridges/5.56x45.jsonnet')
+ cartridge('7_d_62x39', '7.62x39', import 'packages/gun-authoring-tool/cartridges/7.62x39.jsonnet')
+ cartridge('12_h_gauge_h_00_h_buck', '12-gauge-00-buck', import 'packages/gun-authoring-tool/cartridges/12-gauge-00-buck.jsonnet')
+ cartridge('308_h_winchester', '308-winchester', import 'packages/gun-authoring-tool/cartridges/308-winchester.jsonnet')
+ cartridge('357_h_magnum', '357-magnum', import 'packages/gun-authoring-tool/cartridges/357-magnum.jsonnet')
+ cartridge('9x19', '9x19', import 'packages/gun-authoring-tool/cartridges/9x19.jsonnet')
+ [attachment(source) for source in attachmentSources]
+ [
  magazine('magazine_stanag_20', 'stanag-20', '5.56x45', 'ar'),
  magazine('magazine_stanag_30', 'stanag-30', '5.56x45', 'ar'),
  magazine('magazine_akm_30', 'akm-30', '7.62x39', 'ak'),
  magazine('magazine_pistol_9', 'pistol-9', '9x19', 'pistol'),
]
+ [part(item) for item in partItems]
