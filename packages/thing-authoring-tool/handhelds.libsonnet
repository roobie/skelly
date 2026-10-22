local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local atom(id, family, massKg, dimensions, finish, solid='body') = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  handling: { part: id, solid: solid, fraction: [0.5, 0.5, 0.5], turn: [0, 0, -90], hold: 'upright', roll: 0 },
};
local key(id, massKg, bowRadius, shaftLength, metal) = atom(id, 'key', massKg, {
  bowRadius: bowRadius, shaftLength: shaftLength, shaftWidth: 0.012, thickness: 0.003, toothDepth: 0.008,
}, { metal: metal }, 'shaft');
[
  atom('compass', 'compass', 0.120, { radius: 0.03, height: 0.009, bezelHeight: 0.004, displayWidth: 0.026 }, { body: 'plastic-black', bezel: 'steel-grey', display: 'plastic-green' }, 'body') + {
    handling: { part: 'compass', solid: 'body', fraction: [0, 0.5, 0.5], turn: [45, -90, -90], hold: 'upright', roll: 0 },
    anchors: {
      display_mount: { part: 'compass', solid: 'display', fraction: [0.5, 1, 0.5] },
      needle_mount: { part: 'compass', solid: 'display', fraction: [0.5, 1, 0.5] },
    },
  },
  atom('lighter', 'lighter', 0.020, { width: 0.024, height: 0.055, depth: 0.012, capHeight: 0.009 }, { body: 'plastic-red', cap: 'steel-grey', wheel: 'steel-grey' }),
  atom('matches', 'matchbox', 0.020, { width: 0.055, height: 0.015, depth: 0.035, sleeve: 0.004 }, { tray: 'paperboard-tan', sleeve: 'paint-terracotta', striker: 'paperboard-brown' }, 'tray'),
  key('dad_cabin_key', 0.010, 0.012, 0.038, 'steel-grey'),
  key('pharmacy_key', 0.010, 0.011, 0.039, 'brass'),
  key('camp_armoury_key', 0.010, 0.014, 0.043, 'steel-parkerized'),
  key('camp_hq_safe_key', 0.010, 0.010, 0.040, 'brass'),
  key('shed_key', 0.010, 0.012, 0.038, 'steel-grey'),
  key('gauntlet_police_armoury_key', 0.010, 0.014, 0.043, 'steel-blued'),
  atom('gauntlet_lab_entry_card', 'keycard', 0.005, { width: 0.085, height: 0.055, thickness: 0.001, stripeHeight: 0.012 }, { card: 'plastic-white', stripe: 'plastic-blue' }, 'card'),
]
