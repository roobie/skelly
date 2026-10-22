local base = import 'archetype-smg.json';
local parts = base.assembly.parts;
base + {
  template: 'compact-smg',
  assembly: base.assembly + {
    name: 'compact-smg',
    description: 'Compact submachine gun with a threaded, suppressor-ready muzzle.',
    // The front sight is a later build round's part; the archetype's gas-station sight does not fit this barrel.
    parts: {
      [name]: parts[name]
      for name in std.objectFields(parts)
      if name != 'front-sight'
    } + {
      receiver: parts.receiver + { params: parts.receiver.params + { section: 'compact-smg' } },
      barrel: parts.barrel + { params: parts.barrel.params + { muzzle: 'threaded' } },
    },
    connections: [
      c
      for c in base.assembly.connections
      if c.to != 'front-sight.base'
    ],
  },
}
