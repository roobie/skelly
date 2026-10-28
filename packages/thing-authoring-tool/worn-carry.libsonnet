// Shared under-layer measures keep outer shells snug without burying them; straps clear the vest and its pouches.
local carry(overJacket, suffix) =
local bust = import 'bust-measures.libsonnet';
local jacket = import 'jacket-measures.libsonnet';
local bags = import 'bag-measures.libsonnet';
local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local box(id, slot, min, max) = { id: id, kind: 'box', slot: slot, min: min, max: max };
local mirrored(id, slot, xs, ys, zs) = [
  box('%s_left' % id, slot, [xs[0], ys[0], zs[0]], [xs[1], ys[1], zs[1]]),
  box('%s_right' % id, slot, [-xs[1], ys[0], zs[0]], [-xs[0], ys[1], zs[1]]),
];

local level(bottom, height, width, depth, chamfer) = {
  y: [bottom, bottom + height], hx: width / 2, hz: depth / 2, c: chamfer / 2,
};
local jacketLevel(d, bottom, top) = level(bottom, top - bottom, d.width, d.depth, d.chamfer * 2);
local jacketSplit = (jacket.chest.bottom + jacket.chest.top) / 2;
local torso = if overJacket then {
  pelvis: jacketLevel(jacket.hem, 0, jacket.hem.top),
  waist: jacketLevel(jacket.waist, jacket.hem.top, jacket.chest.bottom),
  ribs: jacketLevel(jacket.chest, jacket.chest.bottom, jacketSplit),
  chest: jacketLevel(jacket.chest, jacketSplit, jacket.chest.top),
} else {
  pelvis: level(0, bust.pelvisHeight, bust.pelvisWidth, bust.pelvisDepth, bust.torsoChamfer),
  waist: level(self.pelvis.y[1], bust.waistHeight, bust.waistWidth, bust.waistDepth, bust.torsoChamfer),
  ribs: level(self.waist.y[1], bust.ribHeight, bust.ribWidth, bust.ribDepth, bust.torsoChamfer),
  chest: level(self.ribs.y[1], bust.chestHeight, bust.chestWidth, bust.chestDepth, bust.chestChamfer),
};
local shoulderTop = torso.chest.y[1];

// Clearances must exceed the under-layer's exported surface, including pockets and fasteners, not just its slab.
local fit = {
  vest: [0.012, 0.02],
  stabVest: [0.012, 0.024],
  vestWaist: self.vest,
  stabVestWaist: self.stabVest,
  belt: [0.012, 0.02],
  packStrap: [0.028, 0.036],
  // A pack strap runs over each shoulder in this lane, between the collar and the deltoid.
  packStrapLane: [0.095, 0.125],
  // A pack's shoulder straps end at the front at this height.
  packStrapBottom: 0.3,
  // A vest's shoulder straps, between the collar and the deltoid.
  vestStrapLane: [0.09, 0.165],
  // A vest's hem clears the top of a fanny pack's pouch.
  vestBottom: 0.24,
  // A belt rides on the pelvis, below the step in to the waist.
  beltBand: [0.14, 0.165],
  fannyPackBottom: 0.09,
  slingClearance: 0.008,
  slingInset: 0.02,
} + if overJacket then {
  vest: [0.02, 0.028],
  stabVest: [0.02, 0.032],
  vestWaist: [0.03, 0.038],
  stabVestWaist: [0.03, 0.042],
  belt: [0.03, 0.038],
  packStrap: [0.04, 0.048],
} else {};

// The torso's plan outline at a level, set out by `o`; a y prism's profile is (z, x). Setting a chamfered corner out
// by `o` moves its cut back by `o (2 - sqrt 2)`, so the outline stays parallel.
local octagon(l, o) =
  local hx = l.hx + o;
  local hz = l.hz + o;
  local c = l.c + o * (2 - std.sqrt(2));
  [[-hz + c, -hx], [hz - c, -hx], [hz, -hx + c], [hz, hx - c], [hz - c, hx], [-hz + c, hx], [-hz, hx - c], [-hz, -hx + c]];
// The outline's sides, numbered from the wearer's right side: 0 right, 1 to 3 the front, 4 left, 5 to 7 the back.
local SIDES = { all: std.range(0, 7), front: [1, 2, 3], back: [5, 6, 7], open: [1, 2, 3, 5, 6, 7], flanks: [0, 4] };
local ring(id, slot, l, offsets, heights, sides) =
  local inner = octagon(l, offsets[0]);
  local outer = octagon(l, offsets[1]);
  [
    {
      id: '%s_%d' % [id, i], kind: 'prism', slot: slot, axis: 'y',
      profile: [inner[i], outer[i], outer[(i + 1) % 8], inner[(i + 1) % 8]],
      start: heights[0], end: heights[1],
    }
    for i in sides
  ];

// A vest's shell from its hem to over the shoulders. The arms hang close beside the ribs and chest, so the shell is
// open at the flanks there; `flanks` names the waist sides that close it below them.
local vestShell(id, slot, offsets, waistOffsets, bottom, flanks) =
  ring(id + '_waist', slot, torso.waist, waistOffsets, [bottom, torso.waist.y[1]], SIDES.open + flanks)
  + ring(id + '_ribs', slot, torso.ribs, offsets, torso.ribs.y, SIDES.open)
  + ring(id + '_chest', slot, torso.chest, offsets, [torso.chest.y[0], shoulderTop + offsets[1]], SIDES.open)
  // Shoulder straps join the front and back panels over the top, clear of the collar and the deltoids.
  + mirrored(id + '_shoulder', slot, fit.vestStrapLane, [shoulderTop + offsets[0], shoulderTop + offsets[1]],
             [-(torso.chest.hz + offsets[1]), torso.chest.hz + offsets[1]]);

local utilityVest =
  local front = torso.waist.hz + fit.vestWaist[1];
  local chestFront = torso.chest.hz + fit.vest[1];
  // A pouch with a flap over its top, standing out from the shell; the four pouches are the item's four pockets.
  local pouch(id, xs, ys, z, depth) =
    mirrored(id, 'trim', xs, ys, [z, z + depth])
    + mirrored(id + '_flap', 'body', [xs[0] - 0.003, xs[1] + 0.003], [ys[1] - 0.025, ys[1] + 0.004], [z + depth, z + depth + 0.004]);
  vestShell('vest', 'body', fit.vest, fit.vestWaist, fit.vestBottom, SIDES.flanks)
  // The pouches keep inside the pack straps' lane, so a pack worn over the vest clears them.
  + pouch('pouch_low', [0.015, fit.packStrapLane[0] - 0.01], [0.24, 0.33], front + 0.001, 0.034)
  + pouch('pouch_chest', [0.03, fit.packStrapLane[0] - 0.01], [0.47, 0.56], chestFront + 0.001, 0.024);

local stabVest =
  vestShell('panel', 'body', fit.stabVest, fit.stabVestWaist, fit.vestBottom, [])
  // Side straps close the open flanks at the waist, clear of the hanging arms.
  + ring('side_strap_low', 'trim', torso.waist, [fit.stabVestWaist[0], fit.stabVestWaist[0] + 0.006], [0.25, 0.28], SIDES.flanks)
  + ring('side_strap_high', 'trim', torso.waist, [fit.stabVestWaist[0], fit.stabVestWaist[0] + 0.006], [0.3, 0.33], SIDES.flanks);

// A pack's shoulder straps: down the front to their buckles, over each shoulder, and down the back to the pack.
local packStraps(backTo) =
  local o = fit.packStrap;
  local front = [torso.chest.hz + o[0], torso.chest.hz + o[1]];
  local back = [-(torso.chest.hz + o[1]), -(torso.chest.hz + o[0])];
  mirrored('strap_front', 'strap', fit.packStrapLane, [fit.packStrapBottom, shoulderTop + o[1]], front)
  + mirrored('strap_over', 'strap', fit.packStrapLane, [shoulderTop + o[0], shoulderTop + o[1]], [back[0], front[1]])
  + mirrored('strap_back', 'strap', fit.packStrapLane, [backTo, shoulderTop + o[1]], back)
  + mirrored('buckle', 'trim', [fit.packStrapLane[0] - 0.004, fit.packStrapLane[1] + 0.004],
             [fit.packStrapBottom - 0.012, fit.packStrapBottom + 0.012], [front[1], front[1] + 0.008]);

// A bag hangs from a socket on the straps; its own model's back panel, with its straps, faces the wearer.
local bagSocket(pos, up) = { id: 'bag', mount: 'assembly-joint', gender: 'female', pos: pos, normal: [0, -1, 0], up: up, required: true };
local bagPin(up) = { id: 'bag', mount: 'assembly-joint', gender: 'male', pos: [0, 0, 0], normal: [0, 1, 0], up: up, required: true };
local backpack(id, massKg, bottom) =
  local d = bags[id];
  local panel = -(torso.chest.hz + fit.packStrap[1] + d.strapWidth / 2);
  {
    id: id + '_worn' + suffix,
    exportMass: 'parts',
    voxelGrain: 0.004,
    parts: [
      {
        id: 'straps', family: 'compound', massKg: 0.1,
        params: params({ pieces: packStraps(bottom + d.height * 0.6) }),
        finish: { strap: bags.finish[id].trim, trim: 'polymer-black' },
        ports: [bagSocket([0, bottom, panel - d.depth / 2], [0, 0, 1])],
      },
      { id: 'bag', family: 'bag', massKg: massKg, params: params(d), finish: bags.finish[id], ports: [bagPin([0, 0, 1])] },
    ],
    connections: [{ from: 'straps.bag', to: 'bag.bag' }],
  };

local fannyPack =
  local d = bags.fanny_pack;
  local beltOuter = torso.pelvis.hz + fit.belt[1];
  {
    id: 'fanny_pack_worn' + suffix,
    exportMass: 'parts',
    voxelGrain: 0.004,
    parts: [
      {
        id: 'belt', family: 'compound', massKg: 0.05,
        params: params({ pieces: ring('belt', 'strap', torso.pelvis, fit.belt, fit.beltBand, SIDES.all) }),
        finish: { strap: bags.finish.fanny_pack.trim },
        // Turned to face out from the belly, so the pouch's back panel lies on the belt.
        ports: [bagSocket([0, fit.fannyPackBottom, beltOuter + d.depth / 2], [0, 0, 1])],
      },
      { id: 'bag', family: 'bag', massKg: 0.15, params: params(d), finish: bags.finish.fanny_pack, ports: [bagPin([0, 0, -1])] },
    ],
    connections: [{ from: 'belt.bag', to: 'bag.bag' }],
  };

local wornAtom(id, massKg, pieces, finish) = {
  id: id + suffix,
  exportMass: 'parts',
  voxelGrain: 0.004,
  parts: [{ id: 'shell', family: 'compound', massKg: massKg, params: params({ pieces: pieces }), finish: finish, ports: [] }],
  connections: [],
};

// The sling's strap over the right deltoid: a pad across its top, a short tab over its front, and a leg down its back
// to the slung gun's stock. Its foot meets the gun where `packages/deadvox/src/content/base/models-firearms.libsonnet`,
// `slung`, hangs it.
local sling =
  local deltoidX = if overJacket then jacket.chest.width / 2 - fit.slingInset
                  else bust.chestWidth / 2 + bust.shoulderWidth / 2 - bust.deltoidInset;
  local deltoidTop = if overJacket then shoulderTop + fit.slingClearance else shoulderTop - bust.deltoidDrop;
  local half = if overJacket then jacket.chest.depth / 2 + fit.slingClearance else bust.shoulderDepth / 2;
  local xs = [-deltoidX - 0.012, -deltoidX + 0.012];
  local pad = [deltoidTop + 0.004, deltoidTop + 0.012];
  [
    box('pad', 'strap', [xs[0], pad[0], -half - 0.014], [xs[1], pad[1], half + 0.014]),
    // The tab stays above where a raised arm's top swings.
    box('front', 'strap', [xs[0], deltoidTop - 0.008, half + 0.006], [xs[1], pad[1], half + 0.014]),
    // The leg keeps behind the arm's backswing.
    box('back', 'strap', [xs[0], 0.44, -half - 0.024], [xs[1], pad[1], -half - 0.016]),
    box('foot', 'trim', [xs[0] + 0.004, 0.42, -0.19], [xs[1] - 0.004, 0.44, -half - 0.016]),
  ];

[
  wornAtom('utility_vest_worn', 0.9, utilityVest, { body: 'polymer-od-green', trim: 'cord-olive' }),
  wornAtom('stab_vest_worn', 2.5, stabVest, { body: 'paint-police-blue', trim: 'polymer-black' }),
  backpack('school_backpack', 0.6, 0.15),
  backpack('hiking_backpack', 1.4, 0.06),
  fannyPack,
  wornAtom('weapon_sling_worn', 0.15, sling, { strap: 'cord-olive', trim: 'steel-grey' }),
];
carry(false, '') + carry(true, '_jacket')
