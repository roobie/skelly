local h = import '../compound.libsonnet';
// A flat piece lying in the xz plane, `t` thick about y = `y`; its outline is [z, x] and must be convex.
local flat(id, slot, outline, t, y=0) = h.prism(id, slot, 'y', outline, y - t / 2, y + t / 2);
local held(id, solid) = { handling: h.gripOn(id, solid) };
[
  // A snap-off box cutter, 120 mm with its 9 mm blade run out, 18 mm wide and 11 mm thick.
  h.compound('boxcutter', 0.016, [
    h.box('body', 'body', [0, 0, -0.009], [0.100, 0.011, 0.009]),
    h.box('nose', 'nose', [0.100, 0.002, -0.006], [0.106, 0.009, 0.006]),
    h.box('grip', 'grip', [0.006, 0.011, -0.006], [0.040, 0.012, 0.006]),
    h.box('slider', 'slider', [0.052, 0.011, -0.004], [0.066, 0.015, 0.004]),
    flat('blade', 'blade', [[-0.0045, 0.098], [0.0045, 0.098], [0.0045, 0.110], [-0.0045, 0.120]], 0.002, 0.0055),
  ], { body: 'plastic-yellow', nose: 'steel-grey', grip: 'rubber-black', slider: 'plastic-black', blade: 'steel-stainless' }) + held('boxcutter', 'body') + { voxelGrain: 0.002 },
  // A hammered copper knife 250 mm long: a 150 mm leaf blade 34 mm wide on a 100 mm round copper grip.
  h.compound('copper_knife', 0.51, [
    h.turned('handle', 'handle', 'x', [[0, 0], [0, 0.010], [0.006, 0.012], [0.090, 0.011], [0.098, 0.013], [0.100, 0.013], [0.100, 0]], [-0.100, 0, 0]),
    h.turned('collar', 'collar', 'x', [[0, 0], [0, 0.014], [0.006, 0.014], [0.006, 0]], [-0.004, 0, 0]),
    flat('blade-root', 'blade', [[-0.014, 0], [0.016, 0], [0.018, 0.050], [-0.016, 0.050]], 0.004),
    flat('blade-tip', 'blade', [[-0.016, 0.050], [0.018, 0.050], [0.012, 0.115], [0, 0.150], [-0.010, 0.110]], 0.004),
    flat('rib', 'rib', [[0.001, 0.002], [0.005, 0.002], [0.003, 0.120]], 0.006),
  ], { handle: 'copper', collar: 'copper', blade: 'copper', rib: 'bronze' }) + held('copper_knife', 'handle') + { voxelGrain: 0.002 },
  // A beekeeper's uncapping knife 460 mm long: a 300 mm double-edged blade 45 mm wide on a 130 mm wood handle.
  h.compound('honey_scraper', 0.53, [
    h.turned('handle', 'handle', 'x', [[0, 0], [0, 0.013], [0.010, 0.017], [0.110, 0.016], [0.130, 0.013], [0.130, 0]], [-0.150, 0, 0]),
    h.turned('ferrule', 'ferrule', 'x', [[0, 0], [0, 0.0145], [0.016, 0.0145], [0.016, 0]], [-0.024, 0, 0]),
    flat('shank', 'blade', [[-0.006, -0.010], [0.006, -0.010], [0.010, 0.020], [-0.010, 0.020]], 0.004),
    flat('blade', 'blade', [[-0.010, 0.020], [0.010, 0.020], [0.0225, 0.040], [0.0225, 0.270], [0.012, 0.300], [-0.012, 0.300], [-0.0225, 0.270], [-0.0225, 0.040]], 0.003),
    flat('spine', 'spine', [[-0.004, 0.025], [0.004, 0.025], [0.004, 0.280], [-0.004, 0.280]], 0.005),
  ], { handle: 'wood-walnut', ferrule: 'brass', blade: 'steel-stainless', spine: 'steel-grey' }) + held('honey_scraper', 'handle') + { voxelGrain: 0.002 },
  // A small folding knife opened out: a 65 mm handle 16 mm wide with a 50 mm clip-point blade, 115 mm overall.
  h.compound('pockknife', 0.039, [
    h.box('scales', 'scales', [-0.065, -0.0045, -0.008], [-0.006, 0.0045, 0.008]),
    h.box('bolster-a', 'bolster', [-0.072, -0.0045, -0.008], [-0.065, 0.0045, 0.008]),
    h.box('bolster-b', 'bolster', [-0.006, -0.0045, -0.008], [0.004, 0.0045, 0.008]),
    h.box('shield', 'shield', [-0.040, 0.0045, -0.002], [-0.030, 0.0055, 0.002]),
    h.disc('pivot', 'pivot', 0.003, -0.0055, 0.0055, -0.001, 0.002),
    flat('tang', 'blade', [[-0.004, 0.002], [0.007, 0.002], [0.007, 0.012], [-0.006, 0.012]], 0.002),
    flat('blade', 'blade', [[-0.006, 0.012], [0.007, 0.012], [0.007, 0.035], [0.002, 0.050], [-0.002, 0.051], [-0.006, 0.040]], 0.002),
  ], { scales: 'plastic-red', bolster: 'steel-stainless', shield: 'steel-stainless', pivot: 'steel-grey', blade: 'steel-stainless' }) + held('pockknife', 'scales') + { voxelGrain: 0.002 },
  // A knapped flint blade 140 mm long, 40 mm wide, set 20 mm into a 130 mm split wood handle and lashed with hide.
  h.compound('primitive_knife', 0.19, [
    h.turned('handle', 'handle', 'x', [[0, 0], [0, 0.013], [0.010, 0.017], [0.120, 0.016], [0.130, 0.015], [0.130, 0]], [-0.130, 0, 0]),
    flat('blade-root', 'blade', [[-0.016, -0.020], [0.016, -0.020], [0.020, 0.030], [-0.018, 0.030]], 0.010),
    flat('blade-tip', 'blade', [[-0.018, 0.030], [0.020, 0.030], [0.012, 0.090], [0, 0.120], [-0.012, 0.085]], 0.008),
    flat('flake-a', 'flake', [[-0.012, 0.004], [0.010, 0.004], [0.012, 0.040], [-0.010, 0.050]], 0.002, 0.005),
    flat('flake-b', 'flake', [[-0.008, 0.055], [0.010, 0.050], [0.004, 0.095], [-0.004, 0.095]], 0.002, 0.004),
    h.turned('lashing', 'lashing', 'x', [[0, 0], [0, 0.0185], [0.022, 0.0185], [0.022, 0]], [-0.028, 0, 0]),
  ], { handle: 'wood-walnut', blade: 'stone-grey', flake: 'stone-whet', lashing: 'skin-rawhide' }) + held('primitive_knife', 'handle') + { voxelGrain: 0.002 },
  // A fist-sized cobble 80 mm across with flakes struck off one side into a cutting edge.
  h.compound('stone_chopper', 0.4, [
    h.ball('cortex', 'cortex', 0.032, -0.008, 0.024, 0, 0.75),
    h.prism('edge', 'edge', 'z', [[-0.004, 0.006], [0.040, 0.021], [0.040, 0.023], [-0.004, 0.042]], -0.014, 0.014),
    h.prism('edge-wide', 'edge', 'z', [[-0.010, 0.008], [0.026, 0.017], [0.026, 0.031], [-0.010, 0.040]], -0.024, 0.024),
  ], { cortex: 'stone-whet', edge: 'stone-grey' }) + held('stone_chopper', 'cortex') + { voxelGrain: 0.002 },
  // A hedging bill on a 1.25 m ash shaft: a 220 mm hooked blade 70 mm deep with a back spur, 1.5 m overall.
  h.compound('brush_axe', 2, [
    h.turned('shaft', 'shaft', 'x', [[0, 0], [0, 0.017], [1.200, 0.016], [1.200, 0]]),
    h.turned('socket', 'socket', 'x', [[0, 0], [0, 0.019], [0.100, 0.016], [0.100, 0]], [1.180, 0, 0]),
    flat('blade-root', 'blade', [[-0.014, 1.270], [0.014, 1.270], [0.020, 1.400], [-0.040, 1.400], [-0.034, 1.300]], 0.006),
    flat('blade-belly', 'blade', [[-0.040, 1.400], [0.020, 1.400], [0.016, 1.460], [-0.030, 1.440]], 0.006),
    flat('blade-hook', 'blade', [[-0.030, 1.440], [0.016, 1.460], [0.004, 1.490], [-0.020, 1.500], [-0.046, 1.478]], 0.006),
    flat('spur', 'blade', [[0.014, 1.300], [0.020, 1.330], [0.050, 1.322]], 0.006),
    h.box('neck', 'blade', [1.270, -0.004, -0.012], [1.290, 0.004, 0.012]),
  ], { shaft: 'wood-oak', socket: 'steel-grey', blade: 'steel-grey' }) + held('brush_axe', 'shaft') + { voxelGrain: 0.004 },
  // A 900 mm hardwood stick 35 mm thick, its last 200 mm carved flat into a 55 mm blade and hardened in the fire.
  h.compound('digging_stick', 0.6, [
    h.turned('shaft', 'shaft', 'x', [[0, 0], [0, 0.016], [0.020, 0.018], [0.720, 0.017], [0.720, 0]]),
    h.turned('knot', 'bark', 'x', [[0, 0], [0, 0.019], [0.030, 0.019], [0.030, 0]], [0.300, 0, 0]),
    flat('neck', 'blade', [[-0.015, 0.700], [0.015, 0.700], [0.026, 0.780], [-0.026, 0.780]], 0.022),
    flat('blade', 'blade', [[-0.026, 0.780], [0.026, 0.780], [0.024, 0.850], [-0.024, 0.850]], 0.014),
    flat('tip', 'tip', [[-0.024, 0.850], [0.024, 0.850], [0.010, 0.890], [0, 0.900], [-0.010, 0.890]], 0.010),
  ], { shaft: 'wood-pine', bark: 'bark', blade: 'wood-pine', tip: 'coal-black' }) + held('digging_stick', 'shaft') + { voxelGrain: 0.004 },
]
