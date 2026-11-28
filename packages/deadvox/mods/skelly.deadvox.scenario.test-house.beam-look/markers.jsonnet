local natural = import 'packages/mods/skelly.natural-world/block-materials.jsonnet';
local timber = [material for material in natural.blockMaterials if material.id == 'timber'][0];
{
  // An almost-exhausted burning marker starts the ordinary support cascade without a tester setup action.
  // Its char stays on the wall: it queues the oversized members, not a missing bearing that would fake failure.
  blockMaterials: [timber + {
    id: 'beam_look_marker_material', span: 0, fallsTo: { block: 'charred_remains' },
    flammability+: { burnDurationGameMinutes: 0.001 },
  }],
  blocks: [{
    id: 'beam_look_marker', material: 'beam_look_marker_material', name: 'Ignition marker',
    color: '#d68b32', solid: true, weatherable: false,
    drops: { default: 'item_drop_wood' },
    footsteps: { player: 'footstep_wood' },
  }],
  footstepSounds: [{ id: '8_shambler_beam_look_marker', family: 'shambler', block: 'beam_look_marker', sound: 'shambler_step_wood' }],
}
