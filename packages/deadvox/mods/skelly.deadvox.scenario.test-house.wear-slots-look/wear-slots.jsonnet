local garments = (import 'packages/mods/skelly.wearables/wearables-items.jsonnet').items;
local containers = (import 'packages/mods/skelly.containers/containers-items.jsonnet').items;
local item(rows, id) = std.filter(function(row) row.id == id, rows)[0];
local slot(id, label, order, visibility, selfView) = {
  id: id, label: label, attachmentFrames: ['torso'],
  inventory: { order: order, visibility: visibility }, selfView: selfView,
};
{
  wearSlots: [
    slot('fixture_carry_bay', 'Survey pack', -30, 'occupied', 'frame'),
    slot('fixture_occluded_bay', 'Hidden harness', -20, 'occupied', 'hidden'),
    slot('fixture_spare_bay', 'Spare harness', -10, 'always', 'frame'),
  ],
  items: [
    item(containers, 'school_backpack') + {
      id: 'fixture_survey_pack', name: 'Survey pack',
      wearable+: { slot: 'fixture_carry_bay' },
    },
    item(garments, 'utility_vest') + {
      id: 'fixture_hidden_harness', name: 'Hidden harness',
      wearable+: { slot: 'fixture_occluded_bay' },
    },
  ],
}
