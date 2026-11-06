local k = import 'kit.libsonnet';
local m = import 'machine-kit.libsonnet';
local box = k.box;
local prism = k.prism;
local bothSides = k.bothSides;
local s = import 'classic_small_car.spec.libsonnet';
// The roof and its pillars lie on one half ellipse over the cabin, stepped inward across the car to round its section.
local reach(y) = s.archHalf * std.sqrt(1 - std.pow((y - s.waist) / (s.roof + 0.0 - s.waist), 2));
local fore(y) = s.archX + reach(y);
local aft(y) = s.archX - reach(y);
local roofSlice(id, low, high, half) = prism(id, 'paint', [[aft(low), low], [fore(low), low], [fore(high), high], [aft(high), high]], [-half, half]);
local top = s.windowTop;
local paint = { paint: s.paint, trim: 'plastic-black', glass: 'glass-clear' };
local wing(id, x, from, to) = m.arc(id, 'paint', x, s.hub, 0.31, 0.35, from, to, 9, [0.56, s.side]);
[
  k.compound('classic_small_car_shell', s.shellMass, [
    box('floor_pan', 'pan', [-1.3, 0.2, -s.body], [0.95, s.floor, s.body]),
    box('bulkhead', 'paint', [0.85, s.floor, -s.body], [0.95, s.waist, s.body]),
    box('rear_wall', 'trim', [-1.3, s.floor, -s.body], [-1.25, s.waist, s.body]),
    prism('tail', 'paint', [[-1.86, 0.42], [-1.3, 0.3], [-1.3, s.waist], [-1.82, 0.72]], [-s.body, s.body]),
    box('nose_pan', 'pan', [0.95, 0.3, -0.5], [1.72, 0.34, 0.5]),
    box('nose_panel', 'paint', [1.66, 0.34, -0.5], [1.72, 0.54, 0.5]),
    roofSlice('roof_edge', top, 1.32, 0.56),
    roofSlice('roof_mid', 1.32, 1.39, 0.46),
    roofSlice('roof_crown', 1.39, 1.43, 0.3),
    prism('rear_panel', 'paint', [[aft(s.waist), s.waist], [aft(s.waist) + 0.06, s.waist], [aft(top) + 0.06, top], [aft(top), top]], [-s.body, -0.36]),
    prism('rear_panel_far', 'paint', [[aft(s.waist), s.waist], [aft(s.waist) + 0.06, s.waist], [aft(top) + 0.06, top], [aft(top), top]], [0.36, s.body]),
    prism('rear_screen', 'glass', [[aft(s.waist) + 0.01, s.waist], [aft(s.waist) + 0.05, s.waist], [aft(top) + 0.05, top], [aft(top) + 0.01, top]], [-0.36, 0.36]),
  ] + bothSides([
    box('cowl_side', 'paint', [s.doorFront, s.floor, 0.5], [0.95, s.waist, s.body]),
    prism('a_pillar', 'paint', [[s.doorFront, s.waist], [0.92, s.waist], [fore(top) + 0.06, top], [fore(top) - 0.06, top]], [0.5, s.body]),
    box('b_pillar', 'paint', [s.doorRear - 0.06, s.floor, 0.53], [s.doorRear, top, s.body]),
    box('quarter', 'paint', [-1.3, s.floor, 0.555], [s.doorRear - 0.06, s.waist, s.body]),
    prism('c_pillar', 'paint', [[aft(s.waist), s.waist], [-1.0, s.waist], [-0.8, top], [aft(top), top]], [0.5, s.body]),
    prism('quarter_glass', 'glass', [[-1.0, s.waist], [s.doorRear - 0.06, s.waist], [s.doorRear - 0.06, top], [-0.8, top]], [s.body - 0.02, s.body - 0.01]),
    box('apron', 'paint', [0.95, 0.3, 0.5], [1.5, 0.66, 0.565]),
    box('running_board', 'board', [-0.85, 0.2, 0.56], [0.85, 0.24, s.side]),
    box('sill', 'pan', [-0.85, 0.2, s.body - 0.02], [0.85, s.floor, 0.6]),
  ] + wing('rear_wing', s.rearAxle, -14, 180)), { pan: 'paint-charcoal', paint: s.paint, trim: 'plastic-black', glass: 'glass-clear', board: 'rubber-black' }),
  k.compound('classic_small_car_front_wing', 5, wing('arc', s.frontAxle, 0, 194), { paint: s.paint }),
  k.compound('classic_small_car_windscreen', 9, [
    prism('glass', 'glass', [[0.85, s.waist], [0.89, s.waist], [fore(top) + 0.03, top], [fore(top) - 0.01, top]], [-0.5, 0.5]),
  ], { glass: 'glass-clear' }),
  k.compound('classic_small_car_door', 22, [
    box('skin', 'paint', [s.doorRear, s.floor, s.body - 0.03], [s.doorFront, s.waist, s.body]),
    prism('glass', 'glass', [[s.doorRear, s.waist], [s.doorFront, s.waist], [fore(top) - 0.06, top], [s.doorRear, top]], [s.body - 0.02, s.body - 0.01]),
    box('handle', 'bright', [s.doorRear + 0.05, s.waist - 0.11, s.body - 0.01], [s.doorRear + 0.15, s.waist - 0.08, s.body + 0.015]),
  ], paint + { bright: 'steel-bright' }, { hinge_a: ['skin', [1, 0.2, 1]], hinge_b: ['skin', [1, 0.8, 1]] }),
  k.compound('classic_small_car_bonnet', 11, [
    prism('top', 'paint', [[0.92, 0.95], [1.6, 0.82], [1.6, 0.86], [0.92, 0.99]], [-0.5, 0.5]),
    prism('nose', 'paint', [[1.6, 0.82], [1.72, 0.54], [1.76, 0.56], [1.6, 0.86]], [-0.5, 0.5]),
    prism('seam', 'trim', [[0.92, 0.97], [1.6, 0.84], [1.6, 0.88], [0.92, 1.01]], [-0.03, 0.03]),
  ] + bothSides([
    prism('side', 'paint', [[0.92, 0.3], [1.72, 0.3], [1.72, 0.54], [1.6, 0.84], [0.92, 0.97]], [0.48, 0.51]),
  ]), { paint: s.paint, trim: 'steel-bright' }),
  k.compound('classic_small_car_grille', 3, [
    box('surround', 'bright', [1.72, 0.42, -0.2], [1.77, 0.72, 0.2]),
    box('mesh', 'dark', [1.76, 0.45, -0.17], [1.78, 0.69, 0.17]),
  ], { bright: 'steel-bright', dark: 'plastic-black' }),
  k.compound('classic_small_car_boot_lid', 10, [
    prism('lid', 'paint', [[-1.82, 0.72], [-1.32, s.waist], [-1.32, s.waist + 0.03], [-1.84, 0.75]], [-0.5, 0.5]),
  ], { paint: s.paint }, { hinge_a: ['lid', [1, 1, 1]], hinge_b: ['lid', [1, 1, 0]] }),
  k.compound('classic_small_car_front_bumper', 6, [
    box('bar', 'bright', [1.78, 0.36, -0.68], [1.82, 0.45, 0.68]),
  ] + bothSides([
    box('stay', 'dark', [1.72, 0.38, 0.4], [1.78, 0.43, 0.44]),
    box('overrider', 'bright', [1.79, 0.32, 0.32], [1.83, 0.5, 0.37]),
  ]), { bright: 'steel-bright', dark: 'paint-charcoal' }),
  k.compound('classic_small_car_rear_bumper', 6, [
    box('bar', 'bright', [s.rear, 0.36, -s.body - 0.03], [s.rear + 0.04, 0.45, s.body + 0.03]),
  ] + bothSides([
    box('stay', 'dark', [s.rear + 0.04, 0.38, 0.4], [s.rear + 0.1, 0.43, 0.44]),
    box('overrider', 'bright', [s.rear - 0.01, 0.32, 0.32], [s.rear + 0.03, 0.5, 0.37]),
  ]), { bright: 'steel-bright', dark: 'paint-charcoal' }),
  k.compound('classic_small_car_dashboard', 8, [
    box('panel', 'trim', [0.72, 0.62, -0.5], [0.85, s.waist - 0.01, 0.5]),
    box('column', 'trim', [0.5, 0.63, -0.3], [0.75, 0.69, -0.22]),
  ], { trim: 'plastic-black' }),
  k.compound('classic_small_car_front_axle', 16, [
    box('beam', 'steel', [s.frontAxle - 0.04, s.hub - 0.04, -s.wheelZ + 0.06], [s.frontAxle + 0.04, s.hub + 0.04, s.wheelZ - 0.06]),
  ], { steel: 'steel-grey' }),
  k.compound('classic_small_car_rear_axle', 22, [
    box('beam', 'steel', [s.rearAxle - 0.04, s.hub - 0.04, -s.wheelZ + 0.06], [s.rearAxle + 0.04, s.hub + 0.04, s.wheelZ - 0.06]),
  ], { steel: 'steel-grey' }),
]
