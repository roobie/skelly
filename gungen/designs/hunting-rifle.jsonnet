local base = import 'archetype-bolt-rifle.json';
base + {
  template: 'hunting-rifle',
  calibre: '308-winchester',
  excludedAttachments: ['optic-digital-thermal'],
  finish: { furniture: 'wood-walnut', metal: 'steel-blued' },
  assembly: base.assembly + {
    name: 'hunting-rifle',
    description: 'Civilian turn-bolt rifle with iron sights and an integral, top-loaded magazine.',
    parts: {
      receiver: { item: 'receiver_sporter' },
      'bolt-carrier': { item: 'bolt_carrier_bolt' },
      'bolt-handle-arm': { item: 'bolt_handle_sporter' },
      'bolt-handle-knob': { item: 'bolt_knob_sporter' },
      lower: { item: 'lower_sporter' },
      barrel: { item: 'barrel_sporter_long' },
      handguard: { item: 'handguard_sporter' },
      magazine: { item: 'integral_magazine' },
      stock: { item: 'stock_sporting_medium' },
      'front-sight': { item: 'front_sight_sporter', params: { muzzleInsetRatio: '0.05' } },
      'rear-sight': { item: 'rear_sight_sporter' },
    },
    connections: [c for c in base.assembly.connections if c.to != 'sight.base'] + [
      { from: 'barrel.front-sight', to: 'front-sight.base' },
      { from: 'barrel.rear-sight', to: 'rear-sight.base' },
    ],
  },
}
