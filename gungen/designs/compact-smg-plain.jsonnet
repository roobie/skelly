local base = import 'compact-smg.jsonnet';
local parts = base.assembly.parts;
base + {
  assembly: base.assembly + {
    name: 'compact-smg-plain',
    description: 'Compact submachine gun with a plain, unthreaded muzzle stub.',
    parts: parts + {
      barrel: parts.barrel + { params: parts.barrel.params + { muzzle: 'plain' } },
    },
  },
}
