local t = import 'truck-cab.libsonnet';
local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local s = t.spec(import 'mobile_crane.spec.libsonnet');
local finish = { paint: s.paint, frame: 'paint-charcoal', steel: 'steel-grey', hard: 'steel-hardened', dark: 'plastic-black', glass: 'glass-clear', reflect: 'reflective-yellow', red: 'plastic-red', weight: 'iron-cast', rope: 'steel-galvanised', white: 'paint-white' };
local y = s.boomY;
local section(id, slot, x0, x1, half, halfZ) = box(id, slot, [x0, y - half, -halfZ], [x1, y + half, halfZ]);
local slabs = [-5.6, -5.28, -4.96, -4.64];
local cabRear = -3.0;
local cabFront = -1.7;
local cabIn = 0.55;
local cabOut = 1.15;
local cabRoof = 2.98;
t.rows('mobile_crane', s) + [
  k.compound('mobile_crane_deck', 1800, [
    box('plate', 'paint', [s.deckRear, s.deckLow, -s.side], [s.deckFront, s.deckTop, s.side]),
    box('tread', 'steel', [0.4, s.deckTop, -s.side], [3.7, s.deckTop + 0.03, -0.9]),
    box('tread_near', 'steel', [0.4, s.deckTop, 0.9], [3.7, s.deckTop + 0.03, s.side]),
  ] + k.bothSides([
    box('runner', 'frame', [s.deckRear + 0.1, s.railTop, 0.3], [s.deckFront, s.deckLow, 0.44]),
    box('stripe', 'reflect', [s.deckRear, s.deckTop - 0.06, s.side], [s.deckFront, s.deckTop - 0.01, s.side + 0.032]),
    box('second_axle_spring', 'steel', [s.secondAxle - 0.62, s.r + 0.04, s.railZ], [s.secondAxle + 0.62, s.railBottom, s.railZ + 0.1]),
  ]), finish),
  k.compound('mobile_crane_outrigger', 700, [
    box('beam', 'frame', [-0.24, 0.95, 0], [0.24, s.deckLow, s.side - 0.02]),
    box('end_plate', 'paint', [-0.26, 0.93, s.side - 0.1], [0.26, s.deckLow, s.side + 0.04]),
    box('sleeve', 'paint', [-0.13, 0.7, s.side - 0.06], [0.13, 0.95, s.side + 0.04]),
    k.turned('float', 'steel', 'y', k.disc(0.2, 0.58, 0.7), [0, 0, s.side - 0.14]) + { sides: 16 },
    box('chevron_a', 'reflect', [-0.26, 0.97, s.side + 0.04], [-0.09, s.deckLow - 0.02, s.side + 0.072]),
    box('chevron_b', 'red', [-0.09, 0.97, s.side + 0.04], [0.09, s.deckLow - 0.02, s.side + 0.072]),
    box('chevron_c', 'reflect', [0.09, 0.97, s.side + 0.04], [0.26, s.deckLow - 0.02, s.side + 0.072]),
  ], finish),
  k.compound('mobile_crane_lockers', 120, k.bothSides([
    box('case', 'frame', [-0.45, 0.72, 0.8], [1.2, s.deckLow, s.side - 0.02]),
    box('door_a', 'paint', [-0.4, 0.76, s.side - 0.02], [0.35, 1.12, s.side + 0.012]),
    box('door_b', 'paint', [0.4, 0.76, s.side - 0.02], [1.15, 1.12, s.side + 0.012]),
  ]), finish),
  k.compound('mobile_crane_slew_ring', 800, [
    k.turned('ring', 'frame', 'y', k.disc(1.02, s.deckTop, s.ringTop), [s.ringX, 0, 0]) + { sides: 24 },
  ], finish),
  k.compound('mobile_crane_turret', 1800, [
    box('platform', 'paint', [s.turretRear, s.ringTop, -s.turretSide], [s.turretFront, s.turretTop, s.turretSide]),
  ] + k.bothSides([
    box('foot_plate', 'frame', [-3.94, s.turretTop, 0.36], [-3.16, s.turretTop + 0.1, 0.52]),
    m.bar('cheek_rear', 'paint', [-3.86, s.turretTop + 0.1], [-3.6, y + 0.14], 0.3, [0.36, 0.5]),
    m.bar('cheek_front', 'paint', [-3.24, s.turretTop + 0.1], [-3.6, y + 0.14], 0.3, [0.36, 0.5]),
    k.turned('pin', 'steel', 'z', k.disc(0.13, 0.36, 0.54), [s.boomButt + 0.14, y, 0]) + { sides: 12 },
  ]), finish),
  k.compound('mobile_crane_counterweight', 8000, [
    box('slab_' + i, 'weight', [slabs[i], s.turretTop, -s.turretSide], [slabs[i] + 0.28, 2.86, s.turretSide])
    for i in std.range(0, std.length(slabs) - 1)
  ] + [
    box('core', 'frame', [s.turretRear + 0.04, s.turretTop, -s.turretSide + 0.04], [-4.4, 2.8, s.turretSide - 0.04]),
    box('top', 'paint', [s.turretRear, 2.86, -s.turretSide], [-4.32, 2.92, s.turretSide]),
  ] + k.bothSides([
    box('tail_stripe_a', 'reflect', [s.turretRear - 0.02, 2.0, 0.3], [s.turretRear, 2.5, 0.6]),
    box('tail_stripe_b', 'red', [s.turretRear - 0.02, 2.0, 0.6], [s.turretRear, 2.5, 0.9]),
  ]), finish),
  k.compound('mobile_crane_power_cowl', 300, [
    box('cowl', 'paint', [-4.3, s.turretTop, -s.turretSide], [-1.82, 2.5, -0.62]),
    box('grille', 'dark', [-4.0, 2.0, -s.turretSide - 0.032], [-2.6, 2.34, -s.turretSide]),
    box('stack', 'frame', [-2.2, 2.5, -1.0], [-2.08, 2.84, -0.88]),
  ], finish),
  k.compound('mobile_crane_operator_cab', 350, [
    box('floor', 'frame', [cabRear, s.turretTop, cabIn], [cabFront, s.turretTop + 0.1, cabOut]),
    box('roof', 'paint', [cabRear - 0.02, cabRoof - 0.06, cabIn - 0.02], [cabFront + 0.02, cabRoof, cabOut + 0.02]),
    box('rear_wall', 'paint', [cabRear, s.turretTop + 0.1, cabIn], [cabRear + 0.03125, cabRoof - 0.06, cabOut]),
    box('rear_lining', 'dark', [cabRear + 0.03125, s.turretTop + 0.1, cabIn], [cabRear + 0.0625, cabRoof - 0.06, cabOut]),
    // Dark inside, or the paint behind the clear glass reads as a painted panel.
    box('inner_wall', 'paint', [cabRear, s.turretTop + 0.1, cabIn], [cabFront, cabRoof - 0.06, cabIn + 0.03125]),
    box('inner_lining', 'dark', [cabRear, s.turretTop + 0.1, cabIn + 0.03125], [cabFront, cabRoof - 0.06, cabIn + 0.0625]),
    box('near_low', 'paint', [cabRear, s.turretTop + 0.1, cabOut - 0.06], [cabFront, 2.2, cabOut]),
    box('front_low', 'paint', [cabFront - 0.06, s.turretTop + 0.1, cabIn], [cabFront, 2.2, cabOut]),
    box('post_a', 'paint', [cabFront - 0.06, 2.2, cabOut - 0.06], [cabFront, cabRoof - 0.06, cabOut]),
    box('post_b', 'paint', [-2.42, 2.2, cabOut - 0.06], [-2.36, cabRoof - 0.06, cabOut]),
  ], finish),
  k.compound('mobile_crane_operator_glass', 40, [
    box('front', 'glass', [cabFront - 0.04, 2.2, cabIn + 0.06], [cabFront - 0.01, cabRoof - 0.06, cabOut - 0.06]),
    box('side_a', 'glass', [-2.94, 2.2, cabOut - 0.04], [-2.42, cabRoof - 0.06, cabOut - 0.01]),
    box('side_b', 'glass', [-2.36, 2.2, cabOut - 0.04], [cabFront - 0.06, cabRoof - 0.06, cabOut - 0.01]),
  ], finish),
  k.compound('mobile_crane_winch', 400, [
    k.turned('drum', 'frame', 'z', k.disc(0.26, -0.32, 0.32), [-4.2, 3.06, 0]) + { sides: 16 },
    k.turned('rope', 'rope', 'z', k.disc(0.3, -0.24, 0.24), [-4.2, 3.06, 0]) + { sides: 16 },
  ] + k.bothSides([
    box('cheek', 'paint', [-4.36, 2.86, 0.32], [-4.04, 3.3, 0.38]),
  ]), finish),
  k.compound('mobile_crane_boom_base', 2600, [
    section('base', 'paint', s.boomButt, 1.0, 0.31, 0.36),
    box('butt_lug', 'frame', [s.boomButt - 0.06, y - 0.16, -0.36], [s.boomButt + 0.3, y + 0.16, 0.36]),
    box('collar', 'frame', [0.82, y - 0.34, -0.39], [1.0, y + 0.34, 0.39]),
    box('rope_guard', 'rope', [-3.6, y + 0.31, -0.04], [1.0, y + 0.34, 0.04]),
  ], finish),
  k.compound('mobile_crane_boom_stage_1', 1400, [
    section('stage', 'paint', 1.0, 3.0, 0.26, 0.3),
    box('collar', 'frame', [2.84, y - 0.29, -0.33], [3.0, y + 0.29, 0.33]),
    box('rope', 'rope', [1.0, y + 0.26, -0.04], [3.0, y + 0.29, 0.04]),
  ], finish),
  k.compound('mobile_crane_boom_stage_2', 1000, [
    section('stage', 'paint', 3.0, 4.6, 0.22, 0.25),
    box('collar', 'frame', [4.46, y - 0.25, -0.28], [4.6, y + 0.25, 0.28]),
    box('rope', 'rope', [3.0, y + 0.22, -0.04], [4.6, y + 0.25, 0.04]),
  ], finish),
  k.compound('mobile_crane_boom_stage_3', 700, [
    section('stage', 'paint', 4.6, 5.9, 0.18, 0.2),
    box('rope', 'rope', [4.6, y + 0.18, -0.04], [5.9, y + 0.21, 0.04]),
    box('head', 'frame', [5.9, y - 0.3, -0.16], [6.14, y + 0.24, 0.16]),
    k.turned('sheave', 'steel', 'z', k.disc(0.22, -0.12, 0.12), [6.14, y - 0.06, 0]) + { sides: 16 },
  ], finish),
  k.compound('mobile_crane_derrick_ram', 500, [
    box('foot', 'frame', [-2.2, s.turretTop, -0.2], [-1.8, s.turretTop + 0.12, 0.2]),
    m.bar('barrel', 'frame', [-2.0, s.turretTop + 0.08], [-1.15, 2.42], 0.26, [-0.14, 0.14]),
    m.bar('rod', 'hard', [-1.15, 2.42], [-0.42, y - 0.31], 0.14, [-0.08, 0.08]),
    box('boom_lug', 'frame', [-0.58, y - 0.37, -0.14], [-0.26, y - 0.31, 0.14]),
  ], finish),
  k.compound('mobile_crane_boom_rest', 200, [
    box('cradle', 'frame', [s.restX - 0.1, y - 0.24, -0.5], [s.restX + 0.1, y - 0.22, 0.5]),
    box('saddle_near', 'dark', [s.restX - 0.1, y - 0.22, 0.25], [s.restX + 0.1, y, 0.34]),
    box('saddle_far', 'dark', [s.restX - 0.1, y - 0.22, -0.34], [s.restX + 0.1, y, -0.25]),
  ] + k.bothSides([
    box('post', 'paint', [s.restX - 0.07, s.deckTop, 0.42], [s.restX + 0.07, y - 0.24, 0.52]),
    m.bar('brace', 'frame', [3.2, s.deckTop], [s.restX - 0.05, 2.6], 0.07, [0.44, 0.5]),
  ]), finish),
  k.compound('mobile_crane_hook_block', 300, [
    box('rope_a', 'rope', [6.22, 1.72, 0.03], [6.27, y - 0.2, 0.08]),
    box('rope_b', 'rope', [6.22, 1.72, -0.08], [6.27, y - 0.2, -0.03]),
    box('block', 'paint', [6.08, 1.38, -0.15], [6.4, 1.72, 0.15]),
    box('block_stripe', 'dark', [6.08, 1.5, -0.16], [6.4, 1.58, 0.16]),
    box('shank', 'steel', [6.21, 1.22, -0.04], [6.27, 1.38, 0.04]),
    box('hook', 'red', [6.15, 1.12, -0.05], [6.33, 1.22, 0.05]),
    box('tie', 'steel', [s.front - 0.02, 1.02, -0.04], [6.2, 1.12, 0.04]),
  ], finish),
]
