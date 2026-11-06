local h = import '../compound.libsonnet';
local box = h.box;
// A blade sheath lying flat along x, broad face up, `t` thick: its mouth at x = `x0`, `w` across at the mouth and
// `tw` across at the tip `len` along, centred at z = `cz`, its last `taper` of the length narrowing to the tip.
// A raised spine runs down its middle, a band rings the mouth and a cap the tip. Slots: body, spine, throat, chape,
// mouth.
local sheathFlat(p, len, w, tw, t, taper, x0=0, cz=0, chape=0.03, y0=0) =
  local x1 = x0 + len, xt = x1 - taper;
  [
    h.prism(p + '-body', 'body', 'y', [
      [cz - w / 2, x0], [cz + w / 2, x0], [cz + w / 2, xt], [cz + tw / 2, x1 - 0.004], [cz, x1], [cz - tw / 2, x1 - 0.004], [cz - w / 2, xt],
    ], y0, y0 + t),
    box(p + '-spine', 'spine', [x0 + 0.01, y0 + t, cz - w * 0.16], [xt, y0 + t + 0.002, cz + w * 0.16]),
    box(p + '-throat', 'throat', [x0, y0 - 0.001, cz - w / 2 - 0.001], [x0 + 0.018, y0 + t + 0.003, cz + w / 2 + 0.001]),
    h.prism(p + '-chape', 'chape', 'y', [
      [cz - tw / 2 - 0.001, x1 - chape], [cz + tw / 2 + 0.001, x1 - chape], [cz + tw / 2 + 0.001, x1 - 0.004], [cz, x1 + 0.001], [cz - tw / 2 - 0.001, x1 - 0.004],
    ], y0 - 0.001, y0 + t + 0.001),
    box(p + '-mouth', 'mouth', [x0 - 0.001, y0 + 0.004, cz - w / 2 + 0.004], [x0 + 0.002, y0 + t - 0.004, cz + w / 2 - 0.004]),
  ];
// A diagonal strap lying flat from [xa, za] to [xb, zb], `w` wide and `t` thick.
local strapFlat(id, slot, a, b, w, t, y0=0) =
  local dx = b[0] - a[0], dz = b[1] - a[1], len = std.sqrt(dx * dx + dz * dz), nx = -dz / len * w / 2, nz = dx / len * w / 2;
  h.prism(id, slot, 'y', [[a[1] + nz, a[0] + nx], [b[1] + nz, b[0] + nx], [b[1] - nz, b[0] - nx], [a[1] - nz, a[0] - nx]], y0, y0 + t);
// A buckle frame lying flat at x = x0 on a strap running along x centred at z = cz: `bw` along x, `bh` across z,
// bar `b` wide. Slot buckle.
local buckleFrame(prefix, x0, bw, bh, b, y0, y1, cz) = [
  box(prefix + '-left', 'buckle', [x0 - bw, y0, cz - bh / 2], [x0 - bw + b, y1, cz + bh / 2]),
  box(prefix + '-right', 'buckle', [x0 - b, y0, cz - bh / 2], [x0, y1, cz + bh / 2]),
  box(prefix + '-front', 'buckle', [x0 - bw, y0, cz + bh / 2 - b], [x0, y1, cz + bh / 2]),
  box(prefix + '-back', 'buckle', [x0 - bw, y0, cz - bh / 2], [x0, y1, cz - bh / 2 + b]),
];
// A belt loop folded over a sheath's back at its mouth: a strap `w` across from x0 to x1 on top, its fold proud at
// x0. Slot loop.
local beltLoop(p, x0, x1, w, y, cz=0, t=0.004) = [
  box(p + '-loop', 'loop', [x0, y, cz - w / 2], [x1, y + t, cz + w / 2]),
  box(p + '-loop-fold', 'loop', [x0 - t, y - 0.012, cz - w / 2], [x0, y + t, cz + w / 2]),
];
// A plaited checker of bark strips over a sheath's straight run from x0 to x1, `w` across at z = cz, on a face at
// y: every other cell raised in the darker bark. Slot weave.
local weave(p, x0, x1, w, y, cz=0, cell=0.012) =
  local nx = std.floor((x1 - x0) / cell), nz = std.max(1, std.floor(w / cell));
  [
    box('%s-weave-%d-%d' % [p, i, j], 'weave', [x0 + i * cell, y, cz - w / 2 + j * w / nz], [x0 + (i + 1) * cell, y + 0.0015, cz - w / 2 + (j + 1) * w / nz])
    for i in std.range(0, nx - 1)
    for j in std.range(0, nz - 1)
    if (i + j) % 2 == 0
  ];
local leather = {
  body: 'leather-brown',
  spine: 'leather-brown',
  throat: 'leather-chestnut',
  chape: 'leather-chestnut',
  mouth: 'leather-black',
  loop: 'leather-chestnut',
  strap: 'leather-chestnut',
  stud: 'brass-dull',
  buckle: 'brass-dull',
};
local sword = leather { body: 'leather-black', spine: 'leather-black', throat: 'steel-grey', chape: 'steel-grey', mouth: 'plastic-matte-black', loop: 'leather-brown', strap: 'leather-brown', buckle: 'steel-grey', stud: 'steel-grey' };
local bark = { body: 'bark-birch', spine: 'bark-birch', throat: 'bark', chape: 'bark', mouth: 'plastic-matte-black', weave: 'bark', loop: 'bark', strap: 'bark', buckle: 'bark' };
local nylonKnife = { body: 'plastic-matte-black', spine: 'plastic-matte-black', throat: 'webbing-black', chape: 'webbing-black', mouth: 'nylon-black', strap: 'nylon-black', buckle: 'plastic-matte-black', stud: 'steel-bright', loop: 'webbing-black' };
// A sword scabbard's belt frog lying flat at its mouth: a strap round the throat and a tab across it running off to
// -z with a slot for the belt. Slots as `sheathFlat`, plus loop and stud.
local frog(p, x0, w, t) = [
  box(p + '-frog-wrap', 'loop', [x0 + 0.03, -0.001, -w / 2 - 0.002], [x0 + 0.075, t + 0.002, w / 2 + 0.002]),
  box(p + '-frog-tab', 'loop', [x0 + 0.025, t + 0.002, -w / 2 - 0.1], [x0 + 0.08, t + 0.006, w / 2 + 0.002]),
  box(p + '-frog-slot', 'mouth', [x0 + 0.035, t + 0.006, -w / 2 - 0.085], [x0 + 0.07, t + 0.007, -w / 2 - 0.07]),
  h.disc(p + '-frog-rivet-a', 'stud', 0.004, t + 0.006, t + 0.008, x0 + 0.04, -w / 2 - 0.02),
  h.disc(p + '-frog-rivet-b', 'stud', 0.004, t + 0.006, t + 0.008, x0 + 0.065, -w / 2 - 0.02),
];
// A knife sheath with an ankle or thigh strap laid flat round it: a band `len` straight and `r` round the ends
// lying under the sheath, closed by a buckle on its near run. Slots strap and buckle.
local legStrap(p, length, r, w, x=0) =
  h.strapLoop(p + '-band', 'strap', length, r, w, 0.003, 0, x, 0)
  + buckleFrame(p + '-buckle', x + length / 2 - 0.01, 0.022, w + 0.008, 0.004, 0, 0.006, r);
// A loop of a throwing-knife handle standing proud of a sheath panel: a thin flat handle at x, z with a ring at its
// end. Slot handle and ring.
local thinKnife(p, x, z, y) = [
  box(p + '-grip', 'handle', [x - 0.075, y, z - 0.008], [x, y + 0.004, z + 0.008]),
  h.disc(p + '-ring', 'ring', 0.008, y, y + 0.004, x - 0.083, z),
  h.disc(p + '-ring-hole', 'mouth', 0.004, y + 0.004, y + 0.0045, x - 0.083, z),
];
[
  // A leather belt tab 140 mm long and 45 mm wide folded over a 90 mm steel ring that hangs off its end, laid flat:
  // an axe's handle drops through the ring and its head rests on it.
  h.compound('axe_ring', 0.12, [
    box('tab', 'body', [-0.07, 0, -0.0225], [0.04, 0.008, 0.0225]),
    box('tab-fold', 'loop', [-0.07, 0.008, -0.0225], [-0.02, 0.012, 0.0225]),
    box('tab-wrap', 'loop', [0.03, 0, -0.024], [0.055, 0.011, 0.024]),
    h.disc('rivet-a', 'stud', 0.004, 0.012, 0.014, -0.035, -0.01),
    h.disc('rivet-b', 'stud', 0.004, 0.012, 0.014, -0.035, 0.01),
    h.disc('snap', 'stud', 0.006, 0.008, 0.011, 0.0, 0),
  ] + h.crescent('ring', 'ring', 0.039, 0.046, 0, 360, 16, 0, 0.008, 0.1, 0), leather { ring: 'steel-grey', body: 'leather-brown' })
  + { voxelGrain: 0.002 },

  // A black leather longsword scabbard 1.0 m long, 60 mm wide at the mouth, laid flat: a steel locket at the mouth
  // and a second 250 mm down, each with a ring, two brown hanging straps buckled to a belt slide, and a steel chape.
  h.compound('baldric', 1.1, sheathFlat('scab', 1.0, 0.06, 0.03, 0.022, 0.25, -0.5, 0, 0.06)
    + [
      box('locket-b', 'throat', [-0.26, -0.001, -0.031], [-0.24, 0.025, 0.031]),
    ] + h.crescent('ring-a', 'buckle', 0.009, 0.014, 0, 360, 10, 0.008, 0.013, -0.49, -0.045)
    + h.crescent('ring-b', 'buckle', 0.009, 0.014, 0, 360, 10, 0.008, 0.013, -0.25, -0.045)
    + [
      strapFlat('hanger-a', 'strap', [-0.49, -0.055], [-0.4, -0.2], 0.02, 0.004),
      strapFlat('hanger-b', 'strap', [-0.25, -0.055], [-0.36, -0.2], 0.02, 0.004),
      box('slide', 'loop', [-0.44, 0, -0.25], [-0.32, 0.006, -0.19]),
      box('slide-slot', 'mouth', [-0.43, 0.006, -0.228], [-0.33, 0.007, -0.212]),
    ] + buckleFrame('buckle-a', -0.43, 0.022, 0.028, 0.004, 0.004, 0.009, -0.1)
    + buckleFrame('buckle-b', -0.29, 0.022, 0.028, 0.004, 0.004, 0.009, -0.1), sword)
  + { voxelGrain: 0.004 },

  // A brown leather knife sheath 180 mm long and 40 mm wide for an ankle, laid flat on its buckled ankle strap, a
  // band 250 mm round of 25 mm leather, with a snap strap over the mouth.
  h.compound('bootsheath', 0.08, legStrap('ankle', 0.04, 0.05, 0.025)
    + sheathFlat('sheath', 0.18, 0.04, 0.016, 0.012, 0.07, -0.08, 0.0, 0.025, 0.003)
    + [
      box('snap-strap', 'strap', [-0.07, 0.015, -0.022], [-0.05, 0.019, 0.022]),
      h.disc('snap', 'stud', 0.005, 0.019, 0.021, -0.06, 0.012),
    ], leather)
  + { voxelGrain: 0.002 },

  // A birch-bark ankle sheath 180 mm long and 45 mm wide plaited from pale and dark strips, laid flat on a 25 mm
  // bark ankle strap 250 mm round tied with a toggle.
  h.compound('bootsheath_birchbark', 0.03, h.strapLoop('ankle-band', 'strap', 0.04, 0.05, 0.025, 0.003, 0, 0, 0)
    + sheathFlat('sheath', 0.18, 0.045, 0.02, 0.012, 0.07, -0.08, 0.0, 0.025, 0.003)
    + weave('sheath', -0.06, 0.03, 0.045, 0.015)
    + [h.rod('toggle', 'loop', 0.005, -0.015, 0.025, 0.007) + { origin: [-0.015, 0.007, 0.06] }], bark)
  + { voxelGrain: 0.002 },

  // A black leather back scabbard 1.05 m long and 60 mm wide at the mouth, laid flat with its 50 mm shoulder strap
  // looped beside it from the throat to a ring 300 mm above the chape, a buckle on the strap and a steel chape.
  h.compound('bscabbard', 1.1, sheathFlat('scab', 1.05, 0.06, 0.032, 0.024, 0.25, -0.52, 0, 0.06)
    + [
      box('strap-mount-a', 'loop', [-0.47, -0.001, -0.033], [-0.43, 0.027, 0.033]),
      box('strap-mount-b', 'loop', [0.2, -0.001, -0.033], [0.24, 0.027, 0.033]),
      strapFlat('strap-a', 'strap', [-0.45, -0.03], [-0.2, -0.24], 0.05, 0.004),
      strapFlat('strap-b', 'strap', [-0.2, -0.24], [0.05, -0.27], 0.05, 0.004),
      strapFlat('strap-c', 'strap', [0.05, -0.27], [0.22, -0.03], 0.05, 0.004),
      h.disc('rivet-a', 'stud', 0.005, 0.027, 0.029, -0.45, 0),
      h.disc('rivet-b', 'stud', 0.005, 0.027, 0.029, 0.22, 0),
    ] + buckleFrame('strap-buckle', -0.06, 0.03, 0.065, 0.006, 0.003, 0.009, -0.255), sword { loop: 'leather-brown' })
  + { voxelGrain: 0.004 },

  // A black elastic garter 30 mm wide and 480 mm round laid flat, a moulded black knife sheath 150 mm long sewn
  // along its near run with a press-stud strap over the handle mouth.
  h.compound('gartersheath1', 0.06, h.strapLoop('garter', 'strap', 0.08, 0.064, 0.03, 0.003)
    + sheathFlat('sheath', 0.15, 0.032, 0.012, 0.01, 0.05, -0.06, 0.064, 0.02, 0.003)
    + [
      box('snap-strap', 'loop', [-0.05, 0.013, 0.046], [-0.035, 0.016, 0.082]),
      h.disc('snap', 'stud', 0.004, 0.016, 0.018, -0.0425, 0.074),
    ], nylonKnife { strap: 'cloth-charcoal' })
  + { voxelGrain: 0.002 },

  // A black elastic garter 30 mm wide and 480 mm round laid flat with two moulded knife sheaths 150 mm long sewn
  // side by side on its near run, each with a press-stud strap.
  h.compound('gartersheath2', 0.09, h.strapLoop('garter', 'strap', 0.08, 0.064, 0.03, 0.003)
    + sheathFlat('left', 0.15, 0.032, 0.012, 0.01, 0.05, -0.08, 0.05, 0.02, 0.003)
    + sheathFlat('right', 0.15, 0.032, 0.012, 0.01, 0.05, -0.06, 0.085, 0.02, 0.003)
    + [
      box('snap-left', 'loop', [-0.07, 0.013, 0.032], [-0.055, 0.016, 0.068]),
      h.disc('stud-left', 'stud', 0.004, 0.016, 0.018, -0.0625, 0.06),
      box('snap-right', 'loop', [-0.05, 0.013, 0.067], [-0.035, 0.016, 0.103]),
      h.disc('stud-right', 'stud', 0.004, 0.016, 0.018, -0.0425, 0.095),
    ], nylonKnife { strap: 'cloth-charcoal' })
  + { voxelGrain: 0.002 },

  // A black nylon thigh panel 200 mm tall and 150 mm wide laid flat, six narrow sleeves sewn across it with a
  // ring-ended throwing knife in each, and two 38 mm leg straps buckled to its side.
  h.compound('leg_sheath6', 0.27, [
    box('panel', 'body', [-0.1, 0, -0.075], [0.1, 0.004, 0.075]),
    box('binding-top', 'throat', [-0.1, 0, -0.077], [0.1, 0.005, -0.071]),
    box('binding-bottom', 'throat', [-0.1, 0, 0.071], [0.1, 0.005, 0.077]),
    box('strap-a', 'strap', [-0.085, 0.004, -0.2], [-0.047, 0.006, 0.2]),
    box('strap-b', 'strap', [0.047, 0.004, -0.2], [0.085, 0.006, 0.2]),
  ] + [
      box('buckle-a', 'buckle', [-0.09, 0.004, 0.14], [-0.042, 0.01, 0.16]),
      box('buckle-b', 'buckle', [0.042, 0.004, 0.14], [0.09, 0.01, 0.16]),
    ] + std.flattenArrays([
      [
        box('sleeve-%d' % i, 'spine', [-0.035, 0.006, -0.06 + i * 0.024], [0.09, 0.01, -0.06 + i * 0.024 + 0.02]),
      ] + thinKnife('knife-%d' % i, -0.035, -0.05 + i * 0.024, 0.007)
      for i in std.range(0, 5)
    ]), nylonKnife { body: 'nylon-black', spine: 'webbing-black', handle: 'steel-parkerized', ring: 'steel-parkerized', mouth: 'nylon-black' })
  + { voxelGrain: 0.002 },

  // A brown leather sword scabbard 850 mm long and 50 mm wide at the mouth, laid flat, with a belt frog: a tab
  // with a belt slot strapped round its throat, and a leather tip cap.
  h.compound('scabbard', 0.45, sheathFlat('scab', 0.85, 0.05, 0.028, 0.022, 0.2, -0.4, 0, 0.05)
    + frog('scab', -0.4, 0.05, 0.022), leather)
  + { voxelGrain: 0.004 },

  // A brown leather knife sheath 250 mm long and 45 mm wide laid flat, a belt loop folded over its back at the
  // mouth and a snap strap across the handle.
  h.compound('sheath', 0.1, sheathFlat('sheath', 0.25, 0.045, 0.018, 0.014, 0.09, -0.11, 0, 0.03)
    + beltLoop('sheath', -0.11, -0.04, 0.035, 0.016)
    + [
      box('snap-strap', 'strap', [-0.03, 0.016, -0.025], [-0.01, 0.02, 0.025]),
      h.disc('snap', 'stud', 0.005, 0.02, 0.022, -0.02, 0.014),
    ], leather)
  + { voxelGrain: 0.002 },

  // A birch-bark knife sheath 250 mm long and 50 mm wide plaited from pale and dark strips, laid flat with a bark
  // belt strap 300 mm long trailing from its mouth.
  h.compound('sheath_birchbark', 0.045, sheathFlat('sheath', 0.25, 0.05, 0.022, 0.014, 0.09, -0.11, 0, 0.03)
    + weave('sheath', -0.09, 0.05, 0.05, 0.014)
    + [
      strapFlat('strap', 'strap', [-0.1, 0.0], [-0.32, 0.07], 0.022, 0.003),
      h.rod('toggle', 'loop', 0.005, -0.33, -0.29, 0.006) + { origin: [-0.33, 0.006, 0.075] },
    ], bark)
  + { voxelGrain: 0.002 },

  // A brown leather spear strap laid flat: a torso band 40 mm wide and 1.1 m round, buckled, with a cup for a
  // spear's butt at one end and a loop for its shaft 400 mm along.
  h.compound('spearsling', 0.15, h.strapLoop('band', 'strap', 0.3, 0.08, 0.04, 0.004)
    + buckleFrame('buckle', 0.02, 0.03, 0.05, 0.005, 0, 0.008, 0.08)
    + [
      h.tube('cup', 'body', 0.016, 0.022, -0.27, -0.21, 0.022, -0.08),
      h.disc('cup-end', 'body', 0.022, 0.0, 0.004, -0.27, -0.08) + { axis: 'x', profile: [[0, 0], [0, 0.022], [0.006, 0.022], [0.006, 0]], origin: [-0.276, 0.022, -0.08] },
      h.tube('shaft-loop', 'body', 0.016, 0.021, 0.14, 0.17, 0.021, -0.08),
    ], leather)
  + { voxelGrain: 0.004 },
]
