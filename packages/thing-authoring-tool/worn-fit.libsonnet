// The fitted worn family: each template builds an item's worn shells around the player body's measures, so a
// garment's worn look is a short spec beside its ground row rather than hand-placed geometry. Each template returns
// `rows`, the worn models for the export, and `figureModels`, the matching Deadvox entries, so the segment, frame and
// coverage contract has one source.
local h = import 'compound.libsonnet';
local bust = import 'bust-measures.libsonnet';
local arm = import 'arm-measures.libsonnet';
local leg = import 'leg-measures.libsonnet';

// How far each layer stands off the skin. An outer layer clears every inner one on the same segment.
local layers = { under: 0.003, normal: 0.012, over: 0.024, cloak: 0.036 };

// An upright octagonal shell from y0 to y1, `w` across x and `d` along z, corners cut by `c`.
local oct(id, slot, y0, y1, w, d, c, cx=0, cz=0) = h.prism(id, slot, 'y', [
  [p[0] + cz, p[1] + cx]
  for p in [
    [-d / 2 + c, -w / 2], [d / 2 - c, -w / 2], [d / 2, -w / 2 + c], [d / 2, w / 2 - c],
    [d / 2 - c, w / 2], [-d / 2 + c, w / 2], [-d / 2, w / 2 - c], [-d / 2, -w / 2 + c],
  ]
], y0, y1);

local row(id, pieces, finish) = h.compound(id, 0.1, pieces, finish) + { voxelGrain: 0.004 };

local entry(model, frame, covers) = { model: model, frame: frame, covers: covers, pivot: [0, 0, 0], at: [0, 0, 0], turn: [0, 0, 0] };
local pair(model, side, covers) = [entry(model, 'left_' + side, covers), entry(model, 'right_' + side, covers)];

// Where a torso shell's hem falls on the bust, from the hips' bottom.
local hems = { hip: 0.04, waist: 0.17, thigh: -0.1 };

{
  layers: layers,

  // A jacket, shirt or coat: a body shell over the bust and, unless `sleeves` is 'none', upper and fore sleeves.
  // `slots` names the ground row's finish slots the shells reuse: `body`, `trim` and `fastener`.
  torso(id, finish, spec)::
    local s = { layer: 'normal', hem: 'hip', sleeves: 'long', collar: 'band', zipX: 0, belt: false, pockets: true,
                slots: { body: 'cloth', trim: 'cloth', fastener: 'zip' } } + spec;
    local g = layers[s.layer];
    local sl = s.slots;
    local cut = bust.torsoChamfer / 2;
    local hem = hems[s.hem];
    local lowW = std.max(bust.pelvisWidth, bust.waistWidth) + 2 * g, lowD = std.max(bust.pelvisDepth, bust.waistDepth) + 2 * g;
    local ribTop = bust.pelvisHeight + bust.waistHeight + bust.ribHeight;
    local chestTop = ribTop + bust.chestHeight;
    local chestD = bust.chestDepth + 2 * g, chestW = bust.chestWidth + 2 * g;
    local shoulderX = bust.chestWidth / 2 + bust.shoulderWidth / 2 + 0.03 + g;
    local front(y) = if y < bust.pelvisHeight + bust.waistHeight then lowD / 2 else if y < ribTop then bust.ribDepth / 2 + g else chestD / 2;
    local body = [
      oct('low', sl.body, hem, bust.pelvisHeight + bust.waistHeight, lowW, lowD, cut),
      oct('ribs', sl.body, bust.pelvisHeight + bust.waistHeight - 0.01, ribTop, bust.ribWidth + 2 * g, bust.ribDepth + 2 * g, cut),
      oct('chest', sl.body, ribTop - 0.01, chestTop, chestW, chestD, bust.chestChamfer / 2),
      oct('yoke', sl.body, chestTop - 0.13, chestTop + g, 2 * shoulderX, bust.shoulderDepth + 2 * g, 0.03),
    ] + (if s.collar == 'none' then [] else [
      oct('collar', sl.trim, chestTop - 0.01, chestTop + 0.05, bust.neckWidth + 0.06, bust.neckWidth + 0.06, 0.02, cz=-0.01),
    ]) + (if s.collar == 'lapel' then [
      h.prism('lapel-' + side, sl.trim, 'z', [[side * 0.03, chestTop], [side * 0.13, chestTop - 0.02], [side * 0.04, chestTop - 0.15]],
              chestD / 2, chestD / 2 + 0.008)
      for side in [-1, 1]
    ] else []) + (if s.zipX == null then [] else [
      // The closure runs down each level's front face.
      h.box('zip-' + l[0], sl.fastener, [s.zipX - 0.005, l[1], front(l[1])], [s.zipX + 0.005, l[2], front(l[1]) + 0.004])
      for l in [['low', hem, bust.pelvisHeight + bust.waistHeight], ['ribs', bust.pelvisHeight + bust.waistHeight, ribTop], ['chest', ribTop, chestTop - 0.02]]
    ]) + (if s.pockets then [
      h.box('pocket-' + (if side < 0 then 'l' else 'r'), sl.fastener, [side * 0.13 - 0.04, 0.2, lowD / 2], [side * 0.13 + 0.04, 0.208, lowD / 2 + 0.004])
      for side in [-1, 1]
    ] else []) + (if s.belt then [
      oct('belt', sl.body, hem, hem + 0.035, lowW + 0.008, lowD + 0.008, cut),
      h.box('buckle', sl.fastener, [0.1, hem + 0.002, lowD / 2 + 0.004], [0.135, hem + 0.033, lowD / 2 + 0.008]),
    ] else []);
    local upper = [oct('sleeve', sl.body, -arm.upperLength - arm.seamOverlap, 0.03, arm.upperWidth + 2 * g + 0.01, arm.upperDepth + 2 * g + 0.01, 0.02)];
    local fore = [
      oct('sleeve', sl.body, -arm.foreLength + 0.01, arm.seamOverlap, arm.foreWidth + 2 * g + 0.008, arm.upperDepth + 2 * g + 0.004, 0.02),
      oct('cuff', sl.trim, -arm.foreLength, -arm.foreLength + 0.03, arm.foreWidth + 2 * g + 0.012, arm.upperDepth + 2 * g + 0.008, 0.02),
    ];
    {
      rows: [row(id + '_worn_body', body, finish)]
            + (if s.sleeves == 'none' then [] else [row(id + '_worn_upper', upper, finish), row(id + '_worn_fore', fore, finish)]),
      figureModels: [entry(id + '_worn_body', 'clothing_body', ['torso'])]
                    + (if s.sleeves == 'none' then [] else pair(id + '_worn_upper', 'sleeve', ['upper']) + pair(id + '_worn_fore', 'cuff', ['fore'])),
    },

  // Plate armour: a closed breast and back over the ribs and chest, a gorget, `lames` faulds below the waist over a
  // mail skirt, and pauldrons, rerebraces, couters and vambraces on the arms. Rigid, so it clears the over layer.
  // `slots` names the ground row's finish slots: `plate`, `rim`, `strap`, `rivet` and `mail`.
  plate(id, finish, spec={})::
    local s = { layer: 'over', lames: 2, plackart: false, mail: true, arms: true,
                slots: { plate: 'plate', rim: 'rim', strap: 'strap', rivet: 'rivet', mail: 'mail' } } + spec;
    local g = layers[s.layer], sl = s.slots;
    local cut = bust.torsoChamfer / 2;
    local waistTop = bust.pelvisHeight + bust.waistHeight;
    local ribTop = waistTop + bust.ribHeight;
    local chestTop = ribTop + bust.chestHeight;
    local lowW = std.max(bust.pelvisWidth, bust.waistWidth) + 2 * g, lowD = std.max(bust.pelvisDepth, bust.waistDepth) + 2 * g;
    local chestW = bust.chestWidth + 2 * g, chestD = bust.chestDepth + 2 * g;
    local shoulderX = bust.chestWidth / 2 + bust.shoulderWidth / 2 + 0.03 + g;
    local faulds = 0.05;
    local skirtTop = waistTop - 0.06;
    local body = [
      oct('belly', sl.plate, skirtTop, ribTop, bust.waistWidth + 2 * g, bust.ribDepth + 2 * g, cut),
      oct('breast', sl.plate, ribTop - 0.02, chestTop, chestW, chestD, bust.chestChamfer / 2),
      oct('yoke', sl.plate, chestTop - 0.11, chestTop + g * 0.5, 2 * shoulderX - 0.04, bust.shoulderDepth + 2 * g, 0.03),
      oct('gorget', sl.rim, chestTop - 0.01, chestTop + 0.07, bust.neckWidth + 0.08, bust.neckWidth + 0.08, 0.025, cz=-0.01),
      oct('gorget-lip', sl.rim, chestTop + 0.06, chestTop + 0.075, bust.neckWidth + 0.09, bust.neckWidth + 0.09, 0.025, cz=-0.01),
      // A keel down the breast's front turns blows aside.
      h.prism('keel', sl.plate, 'y', [[chestD / 2, -0.03], [chestD / 2 + 0.014, 0], [chestD / 2, 0.03]], ribTop, chestTop - 0.03),
      oct('rim', sl.rim, skirtTop, skirtTop + 0.012, bust.waistWidth + 2 * g + 0.008, bust.ribDepth + 2 * g + 0.008, cut),
    ] + [
      // Each fauld lame overlaps the one above it and flares a little wider.
      oct('fauld-%d' % i, sl.plate, skirtTop - (i + 1) * faulds, skirtTop - i * faulds + 0.01,
          lowW + 0.01 * (i + 1), lowD + 0.01 * (i + 1), cut)
      for i in std.range(0, s.lames - 1)
    ] + [
      h.box('rivet-%d-%d' % [i, side], sl.rivet, [side * (lowW / 2 - 0.02) - 0.006, skirtTop - (i + 0.5) * faulds - 0.006, lowD / 2 + 0.005 * (i + 1)],
            [side * (lowW / 2 - 0.02) + 0.006, skirtTop - (i + 0.5) * faulds + 0.006, lowD / 2 + 0.005 * (i + 1) + 0.005])
      for i in std.range(0, s.lames - 1)
      for side in [-1, 1]
    ] + (if s.plackart then [
      oct('plackart', sl.plate, skirtTop + 0.01, ribTop - 0.04, bust.waistWidth + 2 * g + 0.012, bust.ribDepth + 2 * g + 0.012, cut),
    ] else []) + (if s.mail then [
      oct('mail', sl.mail, skirtTop - s.lames * faulds - 0.08, skirtTop + 0.02, lowW - 0.006, lowD - 0.006, cut),
    ] else []) + [
      // Shoulder straps over the yoke tie the breast to the back.
      h.box('strap-' + (if side < 0 then 'l' else 'r'), sl.strap, [side * 0.13 - 0.02, chestTop + g * 0.5, -bust.shoulderDepth / 2 - g],
            [side * 0.13 + 0.02, chestTop + g * 0.5 + 0.006, bust.shoulderDepth / 2 + g])
      for side in [-1, 1]
    ];
    local uw = arm.upperWidth + 2 * g, ud = arm.upperDepth + 2 * g;
    local upper = [
      // The pauldron: a cap over the shoulder and lames stepping down the arm.
      oct('pauldron', sl.plate, -0.02, 0.06, uw + 0.06, ud + 0.06, 0.035),
    ] + [
      oct('pauldron-lame-%d' % k, sl.plate, -0.02 - k * 0.032, 0.01 - k * 0.032, uw + 0.06 - 0.01 * k, ud + 0.06 - 0.01 * k, 0.03)
      for k in [1, 2, 3]
    ] + [
      oct('rerebrace', sl.plate, -arm.upperLength - arm.seamOverlap, -0.1, uw + 0.004, ud + 0.004, 0.02),
    ];
    local fw = arm.foreWidth + 2 * g, fd = arm.upperDepth + 2 * g;
    local fore = [
      oct('couter', sl.plate, -0.035, 0.035, fw + 0.03, fd + 0.03, 0.03),
      h.turned('couter-wing', sl.rim, 'z', [[0, 0], [0, 0.038], [0.006, 0.03], [0.012, 0]], [0, 0, -(fd + 0.03) / 2 - 0.004]),
      oct('vambrace', sl.plate, -arm.foreLength + 0.012, -0.03, fw + 0.006, fd + 0.004, 0.02),
      oct('vambrace-rim', sl.rim, -arm.foreLength + 0.012, -arm.foreLength + 0.026, fw + 0.012, fd + 0.01, 0.02),
    ];
    {
      rows: [row(id + '_worn_body', body, finish)]
            + (if s.arms then [row(id + '_worn_upper', upper, finish), row(id + '_worn_fore', fore, finish)] else []),
      figureModels: [entry(id + '_worn_body', 'clothing_body', ['torso'])]
                    + (if s.arms then pair(id + '_worn_upper', 'sleeve', ['upper']) + pair(id + '_worn_fore', 'cuff', ['fore']) else []),
    },

  // Heavy trooper armour: a broad cuirass of stacked belly bands under a slab breastplate with a chevron, a high
  // collar open at the throat, a power pack with exhaust stacks on the back, a webbing belt with pouches and two
  // tasset lames; on the arms, oversized flat-topped pauldrons with a comb, and ribbed vambraces. `ground` is the
  // cuirass standing on the floor, for the item's ground model. Slots: `plate`, `trim`, `strap`, `rivet`, `insignia`.
  trooper(id, finish, spec={})::
    local s = { layer: 'cloak' } + spec;
    local g = layers[s.layer];
    local cut = bust.torsoChamfer / 2;
    local waistTop = bust.pelvisHeight + bust.waistHeight;
    local ribTop = waistTop + bust.ribHeight;
    local chestTop = ribTop + bust.chestHeight;
    local lowW = bust.pelvisWidth + 2 * g, lowD = bust.pelvisDepth + 2 * g;
    local chestW = bust.chestWidth + 2 * g + 0.03, chestD = bust.chestDepth + 2 * g + 0.03;
    local shoulderX = bust.chestWidth / 2 + bust.shoulderWidth / 2 + 0.03 + g;
    local bandBase = waistTop - 0.07;
    local front = chestD / 2, back = -chestD / 2;
    local slabFront = front + 0.012;
    local chevronY = ribTop + 0.05;
    local beltY = bandBase - 0.03;
    local body = [
      // Belly bands, each overlapping the one below and wider towards the chest.
      oct('band-%d' % i, 'plate', bandBase + i * 0.055, bandBase + i * 0.055 + 0.065,
          bust.waistWidth + 2 * g + 0.012 + 0.012 * i, bust.ribDepth + 2 * g + 0.006 + 0.008 * i, cut)
      for i in [0, 1, 2]
    ] + [
      oct('chest', 'plate', ribTop - 0.03, chestTop, chestW, chestD, 0.05),
      h.prism('slab', 'plate', 'z', [[-0.16, ribTop - 0.02], [0.16, ribTop - 0.02], [0.19, chestTop - 0.03], [-0.19, chestTop - 0.03]],
              front - 0.004, slabFront),
    ] + [
      // The chevron, point down, as two convex arms.
      h.prism('chevron-%d' % i, 'insignia', 'z', [
        [side * 0.07, chevronY + 0.03], [0, chevronY - 0.02], [0, chevronY + 0.005], [side * 0.07, chevronY + 0.055],
      ], slabFront - 0.002, slabFront + 0.005)
      for i in [0, 1]
      for side in [[-1, 1][i]]
    ] + [
      oct('yoke', 'plate', chestTop - 0.1, chestTop + 0.02, 2 * shoulderX + 0.02, bust.shoulderDepth + 2 * g + 0.02, 0.04),
    ] + [
      // The collar wraps the back and sides of the neck, clear of the head, and stays open at the throat; a yellow
      // lip caps it.
      piece
      for c in [['collar', 'trim', 0.12, 0.098, 0.03, chestTop, chestTop + 0.085], ['collar-lip', 'insignia', 0.124, 0.096, 0.035, chestTop + 0.075, chestTop + 0.09]]
      for piece in [
        h.box(c[0] + '-back', c[1], [-c[2], c[5], -c[2]], [c[2], c[6], -c[3]]),
        h.box(c[0] + '-left', c[1], [-c[2], c[5], -c[3]], [-c[3], c[6], c[4]]),
        h.box(c[0] + '-right', c[1], [c[3], c[5], -c[3]], [c[2], c[6], c[4]]),
      ]
    ] + [
      // The power pack, finned at the back, its exhaust stacks rising past the shoulders.
      h.box('pack', 'plate', [-0.13, ribTop - 0.02, back - 0.1], [0.13, chestTop - 0.01, back + 0.01]),
    ] + [
      h.box('fin-%d' % i, 'trim', [-0.11, ribTop + 0.01 + i * 0.03, back - 0.115], [0.11, ribTop + 0.025 + i * 0.03, back - 0.1])
      for i in [0, 1, 2, 3]
    ] + [
      h.disc('stack-%d' % i, 'trim', 0.022, chestTop - 0.05, chestTop + 0.08, [-0.09, 0.09][i], back - 0.05)
      for i in [0, 1]
    ] + [
      h.disc('stack-cap-%d' % i, 'rivet', 0.027, chestTop + 0.08, chestTop + 0.092, [-0.09, 0.09][i], back - 0.05)
      for i in [0, 1]
    ] + [
      oct('belt', 'strap', beltY, beltY + 0.045, lowW + 0.01, lowD + 0.01, cut),
      h.box('buckle', 'rivet', [-0.025, beltY + 0.005, lowD / 2 + 0.004], [0.025, beltY + 0.04, lowD / 2 + 0.01]),
    ] + [
      h.box('pouch-%d' % i, 'strap', [[-0.18, 0.09][i], beltY - 0.02, lowD / 2], [[-0.09, 0.18][i], beltY + 0.05, lowD / 2 + 0.04])
      for i in [0, 1]
    ] + [
      oct('tasset-%d' % i, 'plate', beltY - 0.06 * (i + 1) - 0.01, beltY - 0.06 * i + 0.005, lowW + 0.02 + 0.01 * i, lowD + 0.02 + 0.01 * i, cut)
      for i in [0, 1]
    ] + [
      h.box('rivet-%d-%d' % [i, k], 'rivet', [[-0.16, 0.14, -0.01][k], ribTop - 0.02 + i * 0.1, slabFront - 0.002],
            [[-0.14, 0.16, 0.01][k], ribTop + i * 0.1, slabFront + 0.004])
      for i in [0, 1]
      for k in [0, 1]
    ];
    local uw = arm.upperWidth + 2 * g, ud = arm.upperDepth + 2 * g;
    local upper = [
      // The pauldron stands well proud of the shoulder: a flat top, a stepped plate, a comb and a broad rim.
      oct('pauldron', 'plate', -0.03, 0.07, uw + 0.15, ud + 0.13, 0.045),
      oct('pauldron-top', 'plate', 0.07, 0.085, uw + 0.12, ud + 0.1, 0.04),
      oct('pauldron-rim', 'insignia', -0.045, -0.03, uw + 0.158, ud + 0.138, 0.047),
      h.box('comb', 'trim', [-0.01, 0.085, -(ud + 0.09) / 2], [0.01, 0.11, (ud + 0.09) / 2]),
    ] + [
      oct('pauldron-lame-%d' % k, 'plate', -0.045 - k * 0.04, -0.035 - (k - 1) * 0.04, uw + 0.11 - 0.02 * k, ud + 0.09 - 0.02 * k, 0.035)
      for k in [1, 2]
    ] + [
      h.box('pauldron-rivet-%d' % i, 'rivet', [-0.04 + i * 0.04 - 0.006, 0.02, (ud + 0.13) / 2], [-0.04 + i * 0.04 + 0.006, 0.032, (ud + 0.13) / 2 + 0.005])
      for i in [0, 1, 2]
    ] + [
      oct('rerebrace', 'plate', -arm.upperLength - arm.seamOverlap, -0.12, uw + 0.012, ud + 0.012, 0.02),
    ];
    local fw = arm.foreWidth + 2 * g, fd = arm.upperDepth + 2 * g;
    local fore = [
      oct('couter', 'plate', -0.04, 0.04, fw + 0.04, fd + 0.04, 0.03),
      h.turned('couter-boss', 'trim', 'z', [[0, 0], [0, 0.03], [0.008, 0.024], [0.014, 0]], [0, 0, -(fd + 0.04) / 2 - 0.004]),
      oct('vambrace', 'plate', -arm.foreLength + 0.012, -0.035, fw + 0.016, fd + 0.014, 0.022),
    ] + [
      oct('vambrace-rib-%d' % i, 'trim', -0.08 - i * 0.05, -0.068 - i * 0.05, fw + 0.026, fd + 0.024, 0.022)
      for i in [0, 1, 2]
    ] + [
      oct('vambrace-rim', 'insignia', -arm.foreLength + 0.012, -arm.foreLength + 0.028, fw + 0.024, fd + 0.022, 0.022),
    ];
    {
      ground: h.lifted(body, -(beltY - 0.13)),
      rows: [row(id + '_worn_body', body, finish), row(id + '_worn_upper', upper, finish), row(id + '_worn_fore', fore, finish)],
      figureModels: [entry(id + '_worn_body', 'clothing_body', ['torso'])]
                    + pair(id + '_worn_upper', 'sleeve', ['upper']) + pair(id + '_worn_fore', 'cuff', ['fore']),
    },

  // Heavy trooper leg armour: thick cuisses with a front plate, a square knee guard over a domed cop, and greaves with
  // a front ridge. `ground` stands one thigh and shin on the floor. Slots as `trooper`.
  trooperLegs(id, finish, spec={})::
    local s = { layer: 'cloak' } + spec;
    local g = layers[s.layer];
    local shinLength = leg.length - leg.thighLength - leg.shoeHeight;
    local tw = leg.thighWidth + 2 * g, td = leg.thighDepth + 2 * g;
    local sw = leg.shinWidth + 2 * g, sd = leg.shinDepth + 2 * g;
    local kneeD = sd + 0.035;
    local thigh = [
      oct('cuisse', 'plate', -leg.thighLength + 0.03, -0.05, tw + 0.016, td + 0.02, leg.thighChamfer / 2 + 0.012),
      h.box('cuisse-plate', 'plate', [-tw * 0.4, -leg.thighLength + 0.07, (td + 0.02) / 2 - 0.004], [tw * 0.4, -0.08, (td + 0.02) / 2 + 0.012]),
      oct('cuisse-rim', 'insignia', -0.065, -0.05, tw + 0.024, td + 0.028, leg.thighChamfer / 2 + 0.012),
    ] + [
      oct('strap-%d' % i, 'strap', y, y + 0.025, tw + 0.022, td + 0.026, leg.thighChamfer / 2 + 0.012)
      for i in [0, 1]
      for y in [[-0.17, -0.31][i]]
    ];
    local shin = [
      oct('knee', 'plate', -0.065, 0.06, sw + 0.03, kneeD, 0.025),
      h.box('knee-guard', 'plate', [-0.055, -0.07, kneeD / 2 - 0.004], [0.055, 0.075, kneeD / 2 + 0.02]),
      h.dome('knee-cop', 'trim', 0.035, 0.018, 0.006, 'z', [0, 0, kneeD / 2 + 0.02]),
      oct('greave', 'plate', -shinLength - leg.ankleOverlap, -0.05, sw + 0.012, sd + 0.012, leg.shinChamfer / 2 + 0.012),
      h.prism('greave-ridge', 'trim', 'y', [[(sd + 0.012) / 2 - 0.002, -0.014], [(sd + 0.012) / 2 + 0.012, 0], [(sd + 0.012) / 2 - 0.002, 0.014]],
              -shinLength + 0.03, -0.08),
      oct('greave-rim', 'insignia', -shinLength - leg.ankleOverlap, -shinLength + 0.01, sw + 0.02, sd + 0.02, leg.shinChamfer / 2 + 0.012),
    ];
    {
      ground: h.lifted(shin, shinLength + leg.ankleOverlap) + h.lifted(thigh, shinLength + leg.ankleOverlap + leg.thighLength),
      rows: [row(id + '_worn_thigh', thigh, finish), row(id + '_worn_shin', shin, finish)],
      figureModels: pair(id + '_worn_thigh', 'trouser', ['thigh']) + pair(id + '_worn_shin', 'hem', ['shin']),
    },

  // Leg harness: cuisses on the thighs, knee cops and greaves on the shins. `slots` names the ground row's finish
  // slots: `shell`, `cop`, `rim` and `strap`.
  legs(id, finish, spec={})::
    local s = { layer: 'over', greaves: true, slots: { shell: 'shell', cop: 'cop', rim: 'rim', strap: 'strap' } } + spec;
    local g = layers[s.layer], sl = s.slots;
    local shinLength = leg.length - leg.thighLength - leg.shoeHeight;
    local tw = leg.thighWidth + 2 * g, td = leg.thighDepth + 2 * g;
    local sw = leg.shinWidth + 2 * g, sd = leg.shinDepth + 2 * g;
    local thigh = [
      oct('cuisse', sl.shell, -leg.thighLength + 0.02, -0.06, tw, td, leg.thighChamfer / 2 + 0.01),
      oct('cuisse-rim', sl.rim, -0.075, -0.06, tw + 0.008, td + 0.008, leg.thighChamfer / 2 + 0.01),
    ] + [
      oct('strap-%d' % i, sl.strap, y, y + 0.02, tw + 0.006, td + 0.006, leg.thighChamfer / 2 + 0.01)
      for i in [0, 1]
      for y in [[-0.16, -0.3][i]]
    ];
    local shin = [
      // The knee cop bulges forward over the joint, with a fan on the outside.
      oct('poleyn', sl.cop, -0.05, 0.05, sw + 0.02, sd + 0.02, 0.025),
      h.turned('poleyn-boss', sl.cop, 'z', [[0, 0], [0, 0.045], [0.012, 0.035], [0.02, 0]], [0, 0, (sd + 0.02) / 2]),
    ] + (if s.greaves then [
      oct('greave', sl.shell, -shinLength - leg.ankleOverlap, -0.045, sw, sd, leg.shinChamfer / 2 + 0.01),
      oct('greave-rim', sl.rim, -shinLength - leg.ankleOverlap, -shinLength + 0.005, sw + 0.008, sd + 0.008, leg.shinChamfer / 2 + 0.01),
    ] else []);
    {
      rows: [row(id + '_worn_thigh', thigh, finish), row(id + '_worn_shin', shin, finish)],
      figureModels: pair(id + '_worn_thigh', 'trouser', ['thigh']) + pair(id + '_worn_shin', 'hem', if s.greaves then ['shin'] else []),
    },

  // Gloves: a palm and cuff on the wrist, fingers on the knuckles and the thumb on its root, so a curled first-person
  // hand bends its glove too. `cuff` is how far the cuff reaches up the forearm; `fingers` false leaves stubs.
  // The model arm is a right arm whose palm faces +x, so the back of the hand, where `back` details go, is -x.
  hands(id, finish, spec)::
    local s = { layer: 'under', cuff: 0.05, flare: 0.006, hem: 0.006, fingers: true, backRidges: 0,
                slots: { hand: 'hand', cuff: 'cuff', hem: 'hem', ridge: 'stitch' } } + spec;
    local g = layers[s.layer], sl = s.slots;
    local palmX = arm.palmThickness / 2 + g, palmZ = arm.palmWidth / 2 + g;
    local wristX = arm.wristWidth / 2 + g, wristZ = arm.wristWidth / 2 + arm.wristDepthExtra + g;
    local fingerX = arm.palmThickness * arm.fingerThicknessShare / 2 + g;
    local fingerLength = if s.fingers then arm.fingerLength else 0.02;
    local thumbX = arm.palmThickness * arm.thumbThicknessShare / 2 + g;
    local palm = [
      h.box('palm', sl.hand, [-palmX, -arm.palmLength - g, -palmZ], [palmX, arm.handOverlap, palmZ]),
      oct('cuff', sl.cuff, 0, s.cuff, 2 * (wristX + s.flare), 2 * (wristZ + s.flare), 0.012),
    ] + (if s.hem > 0 then [oct('cuff-hem', sl.hem, s.cuff - s.hem, s.cuff + 0.002, 2 * (wristX + s.flare) + 0.004, 2 * (wristZ + s.flare) + 0.004, 0.012)] else [])
      + [
        h.box('ridge-%d' % i, sl.ridge, [-palmX - 0.003, -arm.palmLength + 0.02, -0.02 + i * 0.02 - 0.002], [-palmX, 0, -0.02 + i * 0.02 + 0.002])
        for i in std.range(0, s.backRidges - 1)
      ];
    local fingers = [
      h.box('fingers', sl.hand, [-fingerX, -fingerLength - g, -arm.palmWidth / 2 - g], [fingerX, arm.handOverlap, arm.palmWidth / 2 * arm.fingerFrontShare + g]),
    ] + (if s.fingers then [] else [h.box('stub-hem', sl.hem, [-fingerX - 0.001, -fingerLength - g, -arm.palmWidth / 2 - g - 0.001], [fingerX + 0.001, -fingerLength - g + 0.006, arm.palmWidth / 2 * arm.fingerFrontShare + g + 0.001])]);
    local thumb = [h.box('thumb', sl.hand, [-thumbX, -arm.thumbLength - g, -g], [thumbX, 0, arm.thumbProjection + 0.004 + g])];
    {
      // One glove standing on its fingertips, cuff up, for a ground model; the fingers hang from the palm's end.
      ground: h.lifted(palm, fingerLength + g + arm.palmLength) + h.lifted(fingers, fingerLength + g),
      rows: [row(id + '_worn_palm', palm, finish), row(id + '_worn_fingers', fingers, finish), row(id + '_worn_thumb', thumb, finish)],
      figureModels: pair(id + '_worn_palm', 'glove', ['palm']) + pair(id + '_worn_fingers', 'fingers', ['fingers'])
                    + pair(id + '_worn_thumb', 'thumb', ['thumb']),
    },

  // Boots and shoes from the ground row's own boot spec `b` (length l, width w, sole s, toe, instep, shaft top `top`,
  // laces). The foot rides the ankle; a shaft above the ankle rides the knee so a flexed ankle does not pierce it, and
  // it widens to clear the shin whatever the ground boot's proportions.
  feet(id, finish, b, spec={})::
    local s = { layer: 'normal' } + spec;
    local g = layers[s.layer];
    local ankleY = -leg.shoeHeight;  // The sole's floor, from the ankle.
    local footZ = leg.toeReach - (leg.toeReach + leg.heelReach) / 2;  // The body foot's centre, ahead of the ankle.
    local z0 = footZ - b.l / 2, zt = footZ + b.l / 2 - b.w / 2, zs = z0 + 0.12;
    local y(v) = ankleY + v;
    local foot = [
      h.box('sole', 'sole', [-b.w / 2 - 0.004, y(0), z0 - 0.004], [b.w / 2 + 0.004, y(b.s), zt]),
      h.disc('sole-toe', 'sole', b.w / 2 + 0.004, y(0), y(b.s), 0, zt),
      h.box('heel', 'sole', [-b.w / 2 - 0.004, y(0), z0 - 0.006], [b.w / 2 + 0.004, y(b.s + 0.01), z0 + 0.07]),
      h.prism('vamp', 'upper', 'x', [[y(b.s), z0], [y(b.s), zt], [y(b.s + b.toe), zt], [y(b.s + b.instep), zs], [y(b.s + b.instep), z0]], -b.w / 2, b.w / 2),
      h.turned('toe', 'toe', 'y', [[0, 0], [0, b.w / 2], [b.toe * 0.6, b.w / 2], [b.toe, b.w * 0.3], [b.toe, 0]], [0, y(b.s), zt]),
    ] + (if b.laces == 0 then [] else [
      local zl = zs + f * (zt - zs) * 0.6, yl = y(b.s + b.instep + f * 0.6 * (b.toe - b.instep));
      h.box('instep-lace-%d' % i, 'laces', [-b.w * 0.28, yl - 0.004, zl - 0.004], [b.w * 0.28, yl + 0.002, zl])
      for i in [0, 1]
      for f in [[0.35, 0.75][i]]
    ]);
    // The shaft, in the knee's frame: the ankle sits a shin below the knee.
    local ankle = -(leg.length - leg.thighLength - leg.shoeHeight);
    local shaftW = std.max(b.w * 0.92, leg.shinWidth + 2 * g), shaftD = std.max(0.116, leg.shinDepth + 2 * g);
    // The shaft reaches below the ankle, past the shin's end, so no skin shows over a low vamp.
    local base = ankle - leg.ankleOverlap - 0.004, top = ankle + b.top - leg.shoeHeight;
    local rise = top - 0.02 - (ankle + b.s + b.instep - leg.shoeHeight);
    local shaft = [
      oct('shaft', 'upper', base, top - 0.02, shaftW, shaftD, 0.02),
      oct('collar', 'collar', top - 0.02, top, shaftW + 0.008, shaftD + 0.008, 0.022),
    ] + (if b.laces == 0 then [] else [
      h.box('tongue', 'upper', [-b.w * 0.2, base, shaftD / 2], [b.w * 0.2, top + 0.012, shaftD / 2 + 0.006]),
    ] + [
      local yl = base + 0.01 + i * rise / (b.laces - 1);
      h.box('lace-%d' % i, 'laces', [-b.w * 0.3, yl, shaftD / 2 + 0.006], [b.w * 0.3, yl + 0.004, shaftD / 2 + 0.009])
      for i in std.range(0, b.laces - 1)
    ]);
    {
      // One boot on the floor, the shaft brought from the knee's frame to the ankle's, for a ground model.
      ground: h.lifted(foot, -ankleY) + h.lifted(shaft, -ankle - ankleY),
      rows: [row(id + '_worn_foot', foot, { lining: 'paint-charcoal' } + finish), row(id + '_worn_shaft', shaft, finish)],
      figureModels: pair(id + '_worn_foot', 'boot', ['foot']) + pair(id + '_worn_shaft', 'hem', []),
    },

  // Rigid goods (hats, helmets, goggles): the ground model itself, worn on the head and scaled to fit. Author the
  // model with its face towards +z, the wearer's front. `base` is how far the model's y = 0 sits above the top of the
  // neck, so a helmet that encloses the head takes a negative one; `fit` stretches it round the skull. The head frame
  // sits higher and turns half round, which the entry cancels so callers need not know it.
  head(model, base, fit=[1, 1, 1]):: {
    rows: [],
    figureModels: [entry(model, 'head', []) + { at: [0, base - bust.headFrameRise, 0], turn: [0, 180, 0], scale: fit }],
  },
}
