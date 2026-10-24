// The lab's shared block style: every lab piece binds its materials through `concrete_lab` so finishes stay
// consistent across levels. `packages/deadvox/DESIGN.md`, "Gauntlet".
{
  mapStyles: [{
    id: 'concrete_lab', bindings: {
      concrete: { role: 'shell', block: 'concrete' }, floor: { role: 'interior_floor', block: 'concrete' },
      plaster: { role: 'shell', block: 'plaster' }, metal: { role: 'shell', block: 'galvanized' },
      dressed: { role: 'shell', block: 'dressed_stone' }, rock: { role: 'shell', block: 'rock' },
      hazard_wall: { role: 'shell', block: 'hazard_yellow' }, wire: { role: 'shell', block: 'chain_link' },
      tiles: { role: 'interior_floor', block: 'tiles' }, carpet: { role: 'interior_floor', block: 'carpet' },
      hazard: { role: 'interior_floor', block: 'hazard_yellow' }, planks: { role: 'interior_floor', block: 'planks' },
      air: { role: 'opening', block: 'air' },
    },
  }],
  mapPieces: [],
}
