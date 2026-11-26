local landings = import 'packages/mods/skelly.audio.impact/landings.libsonnet';
local resistance = (import 'tools/jsonnet/lib/damage-resistance.libsonnet').resistance;
// Heat answers as it does on the block materials (`block-materials.jsonnet`). Steel shrugs off the hand-struck kinds as
// metal does there, so only heat really gets into it. Any other kind lands whole, so a piece's own breach decides how
// it takes those blows.
{
  furnitureMaterials: [
    {
      id: 'wood', drops: { default: 'item_drop_wood' } + landings.forFurniture(self.id), blowSound: 'door_bash', methods: ['pry', 'hammer'], broken: { tint: '#d8c9a6', strength: 0.6 },
      resistance: resistance(0, 0, 0, 0, 0, 0, 0, 0, 1),
      damaged: [
        { from: 0.01, tint: '#3a2a1c', strength: 0.2 },
        { from: 0.4, tint: '#3a2a1c', strength: 0.4 },
        { from: 0.75, tint: '#d8c9a6', strength: 0.4 },
      ],
    },
    {
      id: 'steel', drops: { default: 'item_drop_wood' } + landings.forFurniture(self.id), blowSound: 'door_bash', methods: ['pry', 'cut', 'hammer'], broken: { tint: '#9a4a28', strength: 0.55 },
      resistance: resistance(0.4, 0.7, 0.6, 0, 0, 0, 0, 0, 0.1),
      damaged: [
        { from: 0.01, tint: '#2a2a2e', strength: 0.2 },
        { from: 0.4, tint: '#2a2a2e', strength: 0.4 },
        { from: 0.75, tint: '#9a4a28', strength: 0.35 },
      ],
    },
  ],
}
