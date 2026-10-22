local base = import 'archetype-smg.json';
local parts = base.assembly.parts;
base + {
  template: 'compact-smg',
  assembly: base.assembly + {
    name: 'compact-smg',
    description: 'Compact submachine gun with a threaded, suppressor-ready muzzle.',
    // Iron sights only: the archetype's optic and its rail would sit where the rear drum stands.
    parts: {
      [name]: parts[name]
      for name in std.objectFields(parts)
      if name != 'front-sight' && name != 'sight'
    } + {
      receiver: parts.receiver + { params: parts.receiver.params + { section: 'compact-smg', rail: 'none' } },
      barrel: parts.barrel + { params: parts.barrel.params + { muzzle: 'threaded' } },
      'front-sight': { family: 'front-sight', params: { style: 'ringed' } },
      'rear-sight': { family: 'drum-rear-sight' },
    },
    connections: [
      c
      for c in base.assembly.connections
      if c.to != 'sight.base'
    ] + [
      { from: 'receiver.rear-sight', to: 'rear-sight.base' },
    ],
  },
}
