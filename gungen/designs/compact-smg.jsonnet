local base = import 'archetype-smg.json';
local parts = base.assembly.parts;
base + {
  template: 'compact-smg',
  assembly: base.assembly + {
    name: 'compact-smg',
    description: 'Compact submachine gun with a threaded, suppressor-ready muzzle.',
    // No sights until a new sight design is ruled; see `gungen/docs/compact-smg-export.md`, "Rulings".
    parts: {
      [name]: parts[name]
      for name in std.objectFields(parts)
      if name != 'front-sight' && name != 'sight'
    } + {
      receiver: parts.receiver + { params: parts.receiver.params + { section: 'compact-smg', rail: 'none' } },
      barrel: parts.barrel + { params: parts.barrel.params + { muzzle: 'threaded' } },
    },
    connections: [
      c
      for c in base.assembly.connections
      if c.to != 'sight.base' && c.to != 'front-sight.base'
    ],
  },
}
