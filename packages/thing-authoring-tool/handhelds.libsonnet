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
local melee(id, family, massKg, dimensions, finish) = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: id, family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
};
local datum(id, solid, fraction) = { part: id, solid: solid, fraction: fraction };
local held(id, solid, fraction, hold='upright', roll=90) = {
  handling: datum(id, solid, fraction) + { turn: [0, 0, 0], hold: hold, roll: roll },
};
[
  melee('crowbar', 'crowbar', 1.5, {
    back: 0.4, reach: 0.231, kickBack: 0.438, kickRise: 0.113, clawAt: 0.105, clawDrop: 0.129, thickness: 0.03, depth: 0.03,
  }, { body: 'steel-grey' }) + held('crowbar', 'shaft-0', [0.174825174825, 0.5, 0.5]) + {
    anchors: {
      strike: datum('crowbar', 'shaft-1', [0.876315789474, 0.842105263158, 0.5]),
      claw: datum('crowbar', 'shaft-3', [0.046296296296, 0.25, 0.5]),
    },
  },
  melee('hammer', 'hammer', 0.7, {
    handleBack: 0.273, handleRadius: 0.017, headBottom: 0.024, headTop: 0.094, faceReach: 0.1, clawReach: 0.1, headDepth: 0.044,
  }, { handle: 'wood-walnut', head: 'steel-grey' }) + held('hammer', 'handle', [0.258928571429, 0.5, 0.5]) + {
    anchors: {
      strike: datum('hammer', 'eye', [1, 0.533333333333, 0.5]),
      face: datum('hammer', 'face', [0.338235294118, 0, 0.545454545455]),
      claw: datum('hammer', 'claw', [0.558823529412, 1, 0.5]),
    },
  },
  melee('sledgehammer', 'sledgehammer', 4.5, {
    handleBack: 0.84, handleRadius: 0.016, headBottom: 0.005, headTop: 0.062, faceReach: 0.095, headDepth: 0.057,
  }, { handle: 'wood-walnut', head: 'steel-grey' }) + held('sledgehammer', 'handle', [0.441176470588, 0.5, 0.5]) + {
    anchors: {
      strike: datum('sledgehammer', 'head', [1, 0.5, 0.5]),
      face: datum('sledgehammer', 'head', [0.535714285714, 0.005208333333, 0.5]),
    },
  },
  melee('baseball_bat', 'bat', 0.9, {
    back: 0.352, front: 0.427, handleRadius: 0.0165, barrelRadius: 0.035, knobRadius: 0.019,
  }, { body: 'wood-birch' }) + held('baseball_bat', 'body', [0.066666666667, 0.5, 0.5], roll=0) + {
    anchors: { strike: datum('baseball_bat', 'body', [0.999102564103, 0.5, 0.5]) },
  },
  melee('kabar', 'knife', 0.3, {
    back: 0.132, joinAt: 0.01, reach: 0.2205, spine: 0.014, drop: 0.016, thickness: 0.008, handleRadius: 0.014, guardHalf: 0.037, guardDepth: 0.014,
  }, { handle: 'rubber-black', guard: 'steel-blued', blade: 'steel-blued' }) + held('kabar', 'handle', [0.407142857143, 0.5, 0.5], hold='forward', roll=0) + {
    anchors: { strike: datum('kabar', 'blade', [1, 0.5, 0.5]) },
  },
  melee('kitchen_knife', 'knife', 0.15, {
    back: 0.115, joinAt: 0.01, reach: 0.247, spine: 0.015, drop: 0.028, thickness: 0.006, handleRadius: 0.011, guardHalf: 0.016, guardDepth: 0.012,
  }, { handle: 'plastic-black', guard: 'steel-stainless', blade: 'steel-stainless' }) + held('kitchen_knife', 'handle', [0.491935483871, 0.5, 0.5], hold='forward', roll=0) + {
    anchors: { strike: datum('kitchen_knife', 'blade', [0.99625, 0.636363636364, 0.5]) },
  },
  melee('machete', 'knife', 0.55, {
    back: 0.274, joinAt: -0.15, reach: 0.245, spine: 0.02, drop: 0.05, thickness: 0.006, handleRadius: 0.014, guardHalf: 0.022, guardDepth: 0.014,
  }, { handle: 'wood-walnut', guard: 'steel-grey', blade: 'steel-grey' }) + held('machete', 'handle', [0.612903225806, 0.5, 0.5], hold='forward', roll=0) + {
    anchors: {
      strike: datum('machete', 'blade', [1, 0.722222222222, 0.5]),
      edge: datum('machete', 'blade', [0.888888888889, 0.25, 0.5]),
    },
  },
  melee('wrench', 'wrench', 0.5, {
    back: 0.245, handleHalf: 0.0125, headAt: 0.02, jawAt: 0.055, reach: 0.105, headUp: 0.055, headDown: 0.035, gap: 0.022, depth: 0.014,
  }, { body: 'steel-grey' }) + held('wrench', 'handle', [0.640151515152, 0.5, 0.5]) + {
    anchors: { strike: datum('wrench', 'fixed-jaw', [1, 0, 0.5]) },
  },
  melee('steel_pipe', 'steelPipe', 1.8, { length: 0.927, radius: 0.0165, bendDrop: 0.1 }, { body: 'steel-grey' }) + held('steel_pipe', 'tube', [0, 0.5, 0.5], roll=0) + {
    anchors: { strike: datum('steel_pipe', 'bend', [0.972222222222, 0.5, 0]) },
  },
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
