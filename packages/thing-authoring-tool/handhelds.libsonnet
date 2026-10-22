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
// A melee tool carries no handling datum: deadvox's melee model rows own its grip and anchors.
local melee(id, family, massKg, dimensions, finish) = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
};
[
  melee('crowbar', 'crowbar', 1.5, {
    back: 0.4, reach: 0.231, kickBack: 0.438, kickRise: 0.113, clawAt: 0.105, clawDrop: 0.129, thickness: 0.03, depth: 0.03,
  }, { body: 'steel-grey' }),
  melee('hammer', 'hammer', 0.7, {
    handleBack: 0.273, handleRadius: 0.017, headBottom: 0.024, headTop: 0.094, faceReach: 0.1, clawReach: 0.1, headDepth: 0.044,
  }, { handle: 'wood-walnut', head: 'steel-grey' }),
  melee('baseball_bat', 'bat', 0.9, {
    back: 0.352, front: 0.427, handleRadius: 0.0165, barrelRadius: 0.035, knobRadius: 0.019,
  }, { body: 'wood-birch' }),
  melee('kabar', 'knife', 0.3, {
    back: 0.132, joinAt: 0.01, reach: 0.2205, spine: 0.014, drop: 0.016, thickness: 0.008, handleRadius: 0.014, guardHalf: 0.037, guardDepth: 0.014,
  }, { handle: 'rubber-black', guard: 'steel-blued', blade: 'steel-blued' }),
  melee('kitchen_knife', 'knife', 0.15, {
    back: 0.115, joinAt: 0.01, reach: 0.247, spine: 0.015, drop: 0.028, thickness: 0.006, handleRadius: 0.011, guardHalf: 0.016, guardDepth: 0.012,
  }, { handle: 'plastic-black', guard: 'steel-stainless', blade: 'steel-stainless' }),
  melee('machete', 'knife', 0.55, {
    back: 0.274, joinAt: -0.15, reach: 0.245, spine: 0.02, drop: 0.05, thickness: 0.006, handleRadius: 0.014, guardHalf: 0.022, guardDepth: 0.014,
  }, { handle: 'wood-walnut', guard: 'steel-grey', blade: 'steel-grey' }),
  melee('wrench', 'wrench', 0.5, {
    back: 0.245, handleHalf: 0.0125, headAt: 0.02, jawAt: 0.055, reach: 0.105, headUp: 0.055, headDown: 0.035, gap: 0.022, depth: 0.014,
  }, { body: 'steel-grey' }),
  melee('steel_pipe', 'steelPipe', 1.8, { length: 0.927, radius: 0.0165, bendDrop: 0.1 }, { body: 'steel-grey' }),
  melee('flashlight', 'flashlight', 0.25, {
    length: 0.2, bodyRadius: 0.022, headRadius: 0.033, headLength: 0.05, lensDepth: 0.006,
  }, { body: 'polymer-black', lens: 'plastic-white' }),
  atom('compass', 'compass', 0.120, { radius: 0.03, height: 0.009, bezelHeight: 0.004, dialHeight: 0.001 }, { body: 'plastic-black', bezel: 'steel-grey', dial: 'paint-cream', lubber: 'plastic-white' }, 'body') + {
    display: { part: 'compass', solid: 'dial', fraction: [0.5, 1, 0.5], normal: [0, 1, 0], up: [0, 0, -1] },
    anchors: { needle_mount: { part: 'compass', solid: 'dial', fraction: [0.5, 1, 0.5] } },
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
