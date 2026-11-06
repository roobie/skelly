local k = import 'kit.libsonnet';
local m = import 'military-kit.libsonnet';
local s = import 'technical.spec.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local finish = { paint: 'paint-olive', cream: 'paint-cream', rust: 'scrap-rusted', rustred: 'rust-red', frame: 'steel-grey', dark: 'steel-spall-black', trim: 'paint-charcoal', glass: 'glass-clear', floor: 'wood-pine', steel: 'steel-parkerized' };
[
  k.compound('technical_frame', s.frameMass, [
    box('cross_front', 'frame', [s.nose - 0.14, 0.44, -0.34], [s.nose, 0.58, 0.34]),
    box('cross_mid', 'frame', [-0.1, 0.44, -0.34], [0.0, 0.58, 0.34]),
    box('cross_bed', 'frame', [-1.0, 0.44, -0.34], [-0.9, 0.58, 0.34]),
    box('cross_rear', 'frame', [s.rear + 0.02, 0.44, -0.34], [s.rear + 0.12, 0.58, 0.34]),
    box('rear_bumper', 'rust', [s.rear - 0.06, 0.5, -0.86], [s.rear, 0.62, 0.86]),
  ] + bothSides([
    box('rail', 'frame', [s.rear, 0.44, 0.3], [s.nose, 0.58, 0.38]),
    box('leaf_front', 'dark', [s.frontAxle - 0.42, 0.4, 0.3], [s.frontAxle + 0.42, 0.44, 0.38]),
    box('leaf_rear', 'dark', [s.rearAxle - 0.5, 0.4, 0.3], [s.rearAxle + 0.5, 0.44, 0.38]),
    box('sill_bracket', 'frame', [0.2, 0.46, 0.38], [0.3, 0.52, s.skinIn]),
    box('bed_bracket_fore', 'frame', [-0.7, 0.58, 0.3], [-0.6, s.deckBottom, 0.38]),
    box('bed_bracket_aft', 'frame', [-2.3, 0.58, 0.3], [-2.2, s.deckBottom, 0.38]),
  ]), finish),
  k.compound('technical_cab', s.cabMass, bothSides([
    box('sill', 'paint', [s.cabBack, s.sill, s.skinIn - 0.02], [s.cowl, s.floor, s.skin]),
    box('rear_post', 'paint', [s.cabBack, s.floor, s.skinIn], [s.doorRear, s.roof, s.skin]),
    box('corner', 'paint', [s.doorFront, s.floor, s.skinIn], [s.cowl, s.waist, s.skin]),
    prism('a_post', 'paint', [[0.9, s.waist], [s.cowl + 0.02, s.waist], [0.72, s.roof], [0.62, s.roof]], [s.skinIn, s.skin]),
    box('cant_rail', 'paint', [s.cabBack, s.roof - 0.06, s.skinIn], [0.72, s.roof, s.skin]),
    box('sill_rust', 'rust', [0.02, s.sill - 0.005, s.skin], [0.6, s.floor + 0.04, s.skin + 0.01]),
    box('corner_rust', 'rust', [s.doorFront + 0.04, s.floor + 0.02, s.skin], [s.cowl - 0.02, s.floor + 0.14, s.skin + 0.01]),
  ]) + [
    box('floor', 'trim', [s.cabBack, s.floor - 0.03, -s.skinIn], [s.cowl, s.floor, s.skinIn]),
    box('tunnel', 'trim', [0.1, s.floor, -0.18], [s.cowl, s.floor + 0.18, 0.18]),
    box('firewall', 'paint', [s.cowl - 0.04, s.floor, -s.skin], [s.cowl, s.waist, s.skin]),
    box('scuttle', 'paint', [s.cowl - 0.1, s.waist - 0.02, -s.skin], [s.cowl + 0.02, s.waist, s.skin]),
    box('back_lower', 'paint', [s.cabBack, s.floor, -s.skin], [s.cabBack + 0.04, s.waist, s.skin]),
    box('back_upper', 'paint', [s.cabBack, s.roof - 0.1, -s.skin], [s.cabBack + 0.04, s.roof, s.skin]),
    box('back_post_near', 'paint', [s.cabBack, s.waist, 0.58], [s.cabBack + 0.04, s.roof - 0.1, s.skin]),
    box('back_post_far', 'paint', [s.cabBack, s.waist, -s.skin], [s.cabBack + 0.04, s.roof - 0.1, -0.58]),
    box('roof', 'paint', [s.cabBack - 0.02, s.roof, -s.skin], [0.74, s.roof + 0.05, s.skin]),
    box('roof_rust', 'rustred', [-0.18, s.roof + 0.05, 0.1], [0.3, s.roof + 0.06, 0.56]),
    prism('header', 'paint', [[0.62, s.roof - 0.06], [0.74, s.roof - 0.06], [0.74, s.roof], [0.62, s.roof]], [-s.skin, s.skin]),
    box('back_rust', 'rust', [s.cabBack - 0.01, 0.7, -0.5], [s.cabBack, 0.98, -0.18]),
  ], finish),
  k.compound('technical_door', 32, [
    box('skin', 'paint', [s.doorRear, s.floor, s.skinIn], [s.doorFront, s.waist, s.skin]),
    box('stile', 'paint', [s.doorRear, s.waist, s.skinIn], [s.doorRear + 0.06, s.roof - 0.06, s.skin]),
    box('head', 'paint', [s.doorRear, s.roof - 0.12, s.skinIn], [s.windowFront, s.roof - 0.06, s.skin]),
    box('glass', 'glass', [s.doorRear + 0.06, s.waist, s.skinIn + 0.01], [s.windowFront, s.roof - 0.12, s.skin - 0.01]),
    prism('quarter', 'glass', [[s.windowFront, s.waist], [0.92, s.waist], [0.68, s.roof - 0.06], [s.windowFront, s.roof - 0.06]], [s.skinIn + 0.01, s.skin - 0.01]),
    box('handle', 'dark', [s.doorRear + 0.08, s.waist - 0.1, s.skin], [s.doorRear + 0.22, s.waist - 0.06, s.skin + 0.02]),
    box('rust_low', 'rust', [s.doorRear + 0.1, s.floor + 0.02, s.skin], [s.doorFront - 0.24, s.floor + 0.14, s.skin + 0.01]),
    box('rust_patch', 'rustred', [0.32, 0.86, s.skin], [0.56, 1.02, s.skin + 0.01]),
  ], finish, { hinge_a: ['skin', [1, 0.2, 1]], hinge_b: ['skin', [1, 0.8, 1]] }),
  k.compound('technical_windows', 22, [
    prism('windscreen', 'glass', [[0.93, s.waist], [0.97, s.waist], [0.7, s.roof - 0.04], [0.66, s.roof - 0.04]], [-s.skinIn, s.skinIn]),
    box('back_glass', 'glass', [s.cabBack + 0.01, s.waist, -0.58], [s.cabBack + 0.03, s.roof - 0.1, 0.58]),
  ], finish),
  k.compound('technical_dashboard', 11, [
    box('panel', 'trim', [s.cowl - 0.3, s.floor + 0.42, -s.skinIn], [s.cowl - 0.04, s.waist - 0.02, s.skinIn]),
    box('column', 'dark', [s.cowl - 0.33, s.floor + 0.66, -0.4], [s.cowl - 0.3, s.floor + 0.7, -0.36]),
  ], finish),
  k.compound('technical_bonnet', 30, [
    prism('top', 'cream', [[s.cowl, s.bonnetBackY - 0.04], [s.nose, s.bonnetFrontY - 0.04], [s.nose, s.bonnetFrontY], [s.cowl, s.bonnetBackY]], [-0.72, 0.72]),
    box('dent', 'rustred', [1.6, 1.06, -0.46], [2.0, 1.075, -0.12]),
  ], finish),
  k.compound('technical_wing', 16, m.arched('panel', 'paint', [s.cowl, s.nose + 0.05], [s.sill, s.wingTop], [s.panelIn, s.side], [{ x: s.frontAxle, y: s.hub, r: s.archR }]) + [
    box('top', 'paint', [s.cowl, s.wingTop - 0.04, 0.72], [s.nose + 0.05, s.wingTop, s.panelIn]),
    box('inner', 'trim', [s.cowl, s.sill, s.innerZ - 0.03], [s.nose, s.wingTop - 0.04, s.innerZ]),
    box('crown', 'trim', [s.frontAxle - 0.46, 0.82, s.innerZ], [s.frontAxle + 0.46, 0.85, s.panelIn]),
    box('rust', 'rust', [s.nose - 0.26, s.sill + 0.02, s.side], [s.nose + 0.05, 0.72, s.side + 0.01]),
    box('rust_arc', 'rustred', [1.0, 0.68, s.side], [1.14, 0.86, s.side + 0.01]),
  ], finish),
  k.compound('technical_grille', 18, [
    box('backing', 'dark', [s.nose, s.sill + 0.08, -s.side], [s.nose + 0.05, s.bonnetFrontY, s.side]),
    box('head', 'paint', [s.nose + 0.05, s.bonnetFrontY - 0.06, -s.side], [s.nose + 0.07, s.bonnetFrontY, s.side]),
    box('foot', 'rust', [s.nose + 0.05, s.sill + 0.08, -s.side], [s.nose + 0.07, s.sill + 0.16, s.side]),
    box('bar', 'rust', [s.nose + 0.05, 0.78, -0.44], [s.nose + 0.07, 0.82, 0.44]),
  ], finish),
  k.compound('technical_bull_bar', 42, [
    box('bar', 'rust', [s.nose + 0.1, 0.5, -0.9], [s.frontBumper, 0.66, 0.9]),
    box('top', 'dark', [s.frontBumper - 0.06, 1.0, -0.56], [s.frontBumper - 0.01, 1.05, 0.5]),
    box('angle', 'dark', [s.frontBumper - 0.06, 0.82, -0.3], [s.frontBumper - 0.01, 0.86, 0.62]),
    box('post_near', 'dark', [s.frontBumper - 0.06, 0.66, 0.46], [s.frontBumper - 0.01, 1.05, 0.5]),
    box('post_far', 'rust', [s.frontBumper - 0.06, 0.66, -0.56], [s.frontBumper - 0.01, 1.05, -0.5]),
    box('post_mid', 'dark', [s.frontBumper - 0.06, 0.66, 0.18], [s.frontBumper - 0.01, 1.0, 0.22]),
    box('stay_near', 'rust', [s.nose + 0.07, 0.56, 0.3], [s.nose + 0.1, 0.62, 0.38]),
    box('stay_far', 'rust', [s.nose + 0.07, 0.56, -0.38], [s.nose + 0.1, 0.62, -0.3]),
  ], finish),
  k.compound('technical_bed_floor', 50, [
    box('floor', 'floor', [s.rear + 0.04, s.deckBottom, -s.panelIn], [s.bedFront, s.deckTop, s.panelIn]),
  ], finish),
  k.compound('technical_bed', 110, bothSides(
    m.arched('side', 'paint', [s.rear + 0.04, s.bedFront], [s.sill, s.bedTop], [s.panelIn, s.side], [{ x: s.rearAxle, y: s.hub, r: s.archR }])
    + [
      box('rail_cap', 'trim', [s.rear + 0.04, s.bedTop, s.panelIn - 0.04], [s.bedFront, s.bedTop + 0.03, s.side + 0.01]),
      box('inner', 'trim', [s.rear + 0.04, s.deckTop, s.panelIn - 0.02], [s.bedFront, s.bedTop, s.panelIn]),
      box('well', 'trim', [s.rearAxle - 0.52, s.sill + 0.04, s.innerZ - 0.03], [s.rearAxle + 0.52, s.deckBottom, s.innerZ]),
      box('crown', 'trim', [s.rearAxle - 0.46, 0.82, s.innerZ], [s.rearAxle + 0.46, 0.85, s.panelIn]),
      box('tub_top', 'paint', [s.rearAxle - 0.46, 1.04, s.innerZ], [s.rearAxle + 0.46, 1.07, s.panelIn - 0.02]),
      box('tub_wall', 'paint', [s.rearAxle - 0.46, s.deckTop, s.innerZ], [s.rearAxle + 0.46, 1.04, s.innerZ + 0.03]),
      box('rust_low', 'rust', [-2.5, s.sill + 0.02, s.side], [s.rearAxle - 0.5, 0.68, s.side + 0.01]),
      box('rust_high', 'rustred', [-0.86, 0.92, s.side], [-0.5, 1.12, s.side + 0.01]),
    ]
  ) + [
    box('headboard', 'paint', [s.bedFront - 0.04, s.deckTop, -s.side], [s.bedFront, s.bedTop, s.side]),
  ], finish),
  k.compound('technical_tailgate', 26, [
    box('gate', 'paint', [s.rear, s.deckBottom - 0.2, -s.panelIn], [s.rear + 0.04, s.bedTop, s.panelIn]),
    box('rust', 'rust', [s.rear - 0.01, 0.74, -0.5], [s.rear, 1.0, 0.2]),
    box('catch', 'dark', [s.rear - 0.02, s.bedTop - 0.08, 0.76], [s.rear, s.bedTop - 0.04, 0.84]),
  ], finish),
  k.compound('technical_roll_hoop', 34, [
    box('top', 'rust', [s.bedFront - 0.12, 1.8, -0.72], [s.bedFront - 0.06, 1.86, 0.72]),
    box('foot_bar', 'rust', [s.bedFront - 0.14, s.deckTop, -0.72], [s.bedFront - 0.04, s.deckTop + 0.03, 0.72]),
  ] + bothSides([
    box('leg', 'rust', [s.bedFront - 0.12, s.deckTop + 0.03, 0.66], [s.bedFront - 0.06, 1.8, 0.72]),
    box('brace', 'dark', [s.bedFront - 0.06, 1.6, 0.66], [s.cabBack, 1.64, 0.72]),
  ]), finish),
  // A mount only: the post ends in an empty yoke behind a welded gun shield, its slot left clear.
  k.compound('technical_pedestal', 85, [
    box('base', 'steel', [-0.26, 0, -0.26], [0.26, 0.04, 0.26]),
    k.turned('post', 'steel', 'y', k.disc(0.055, 0.04, 0.94)) + { sides: 12 },
    k.turned('collar', 'dark', 'y', k.disc(0.085, 0.92, 0.98)) + { sides: 12 },
    box('yoke_base', 'steel', [-0.1, 0.98, -0.16], [0.1, 1.01, 0.16]),
    box('gusset_x', 'steel', [-0.24, 0.04, -0.015], [0.24, 0.22, 0.015]),
    box('gusset_z', 'steel', [-0.015, 0.04, -0.24], [0.015, 0.22, 0.24]),
    box('shield_arm', 'steel', [0.1, 0.98, -0.04], [0.14, 1.01, 0.04]),
    box('shield_head', 'rust', [0.14, 1.34, -0.09], [0.17, 1.44, 0.09]),
    box('shield_foot', 'rust', [0.14, 0.98, -0.09], [0.17, 1.08, 0.09]),
  ] + bothSides([
    box('shield', 'rust', [0.14, 0.98, 0.09], [0.17, 1.44, 0.36]),
    box('yoke_arm', 'steel', [-0.05, 1.01, 0.13], [0.05, 1.2, 0.16]),
    box('foot', 'dark', [-0.22, 0.04, 0.17], [-0.16, 0.06, 0.23]),
  ]), finish),
  k.compound('technical_steering_box', 12, [
    box('box', 'dark', [1.2, 0.5, -0.42], [1.32, 0.6, -0.3]),
    box('drag_link', 'frame', [1.28, 0.44, -0.45], [1.54, 0.47, -0.42]),
    box('arm', 'frame', [1.26, 0.44, -0.42], [1.32, 0.5, -0.38]),
  ], finish),
]
