local base = import 'archetype-smg.json';
local parts = base.assembly.parts;
base + {
  template: 'compact-smg',
  assembly: base.assembly + {
    name: 'compact-smg',
    description: 'Compact submachine gun with a threaded, suppressor-ready muzzle.',
    // Its traced sights are barrel and receiver solids, so the add-on sight parts stay off; see
    // `packages/gun-authoring-tool/docs/compact-smg-export.md`, "Rulings".
    parts: {
      [name]: parts[name]
      for name in std.objectFields(parts)
      if name != 'front-sight' && name != 'sight'
    } + {
      receiver: parts.receiver + { params: parts.receiver.params + { section: 'compact-smg', rail: 'none' } },
      barrel: parts.barrel + { params: parts.barrel.params + { muzzle: 'threaded' } },
      stock: parts.stock + { params: parts.stock.params + { style: 'telescoping', pose: 'extended' } },
    },
    connections: [
      c
      for c in base.assembly.connections
      if c.to != 'sight.base' && c.to != 'front-sight.base'
    ],
  },
}
