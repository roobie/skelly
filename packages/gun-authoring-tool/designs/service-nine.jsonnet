local base = import 'archetype-pistol.json';
base + {
  calibre: '9x19',
  finish: { furniture: 'polymer-black', metal: 'steel-blued' },
  assembly: base.assembly + {
    name: 'service-nine',
    description: 'Polymer-frame striker-fired 9×19 mm service pistol.',
    parts: {
      frame: { item: 'pistol_frame' },
      slide: { item: 'pistol_slide' },
      barrel: { item: 'barrel_pistol' },
      magazine: { family: 'magazine', params: { length: 'S', profile: 'pistol' }, prefab: { id: 'pistol-9', version: 1 } },
      sight: { family: 'sight', params: { type: 'mini-reflex' } },
    },
  },
}
