local slot(id, label, frames, order, capability=[], visibility='always', selfView='frame') = {
  id: id,
  label: label,
  attachmentFrames: frames,
  inventory: { visibility: visibility, order: order },
  selfView: selfView,
} + if std.length(capability) == 0 then {} else { capability: capability };
{
  wearSlots: [
    slot('head', 'Head', ['head'], -3, ['headEquipment'], 'occupied'),
    slot('eyes', 'Eyes', ['head'], -2, visibility='occupied', selfView='hidden'),
    slot('shoulder', 'Shoulder', ['torso'], 0, ['slungLongGun']),
    slot('torso', 'Torso', ['clothing_body', 'left_sleeve', 'right_sleeve', 'left_cuff', 'right_cuff'], 1, ['underLayerFit']),
    slot('vest', 'Vest', ['torso'], 2),
    slot('hands', 'Hands', ['left_hand', 'right_hand'], 3),
    slot('legs', 'Legs', ['clothing_body', 'left_trouser', 'right_trouser', 'left_hem', 'right_hem'], 4),
    slot('feet', 'Feet', ['left_boot', 'right_boot', 'left_hem', 'right_hem'], 5),
    slot('back', 'Back', ['torso'], 6, ['preferredCarry']),
    slot('waist', 'Waist', ['torso'], 7),
  ],
}
