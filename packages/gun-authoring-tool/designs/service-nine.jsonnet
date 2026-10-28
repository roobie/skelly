local base = import 'archetype-pistol.json';
base + {
  calibre: '9x19',
  finish: { furniture: 'polymer-black', metal: 'steel-blued' },
  assembly: base.assembly + {
    name: 'service-nine',
    connections: [connection for connection in base.assembly.connections if connection.to != 'sight.base'],
    description: 'Polymer-frame striker-fired 9×19 mm service pistol.',
    parts: {
      [id]: base.assembly.parts[id]
      for id in std.objectFields(base.assembly.parts)
      if id != 'sight'
    } + {
      frame: { item: 'pistol_frame' },
      slide: { item: 'pistol_slide' },
      barrel: { item: 'barrel_pistol' },
      magazine: { family: 'magazine', params: { length: 'S', profile: 'pistol' }, prefab: { id: 'pistol-9', version: 1 } },
    },
  },
}
