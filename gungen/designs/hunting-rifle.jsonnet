local base = import 'archetype-bolt-rifle.json';
base + {
  template: 'hunting-rifle',
  calibre: '308-winchester',
  excludedAttachments: ['optic-digital-thermal'],
  finish: { furniture: 'wood-walnut', metal: 'steel-blued' },
  assembly: base.assembly + {
    name: 'hunting-rifle',
    description: 'Civilian turn-bolt rifle with iron sights and an integral, top-loaded magazine.',
    parts: { [id]: base.assembly.parts[id] for id in std.objectFields(base.assembly.parts) if id != 'sight' } + {
      receiver: base.assembly.parts.receiver + { params: base.assembly.parts.receiver.params + { section: 'sporter' } },
      'bolt-carrier': { family: 'bolt-carrier', params: { pattern: 'bolt', handleProfile: 'sporter' } },
      lower: { family: 'lower', params: { layout: 'conventional', magazineWell: 'recessed' } },
      magazine: { family: 'magazine', params: { length: 'S', integral: 'yes', wellBody: 'sporter' } },
      stock: { family: 'stock', params: { length: 'M', style: 'sporting', combDegrees: '2' } },
      'front-sight': { family: 'front-sight', params: { style: 'sporting', muzzleInsetRatio: '0.05' } },
      'rear-sight': { family: 'sporting-rear-sight' },
    },
    connections: [c for c in base.assembly.connections if c.to != 'sight.base'] + [
      { from: 'barrel.front-sight', to: 'front-sight.base' },
      { from: 'barrel.rear-sight', to: 'rear-sight.base' },
    ],
  },
}
