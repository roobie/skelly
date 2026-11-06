local k = import 'kit.libsonnet';
local s = import 'panel_van.spec.libsonnet';
local box = k.box;
local top = s.roof + 0.34;
[
  // Sits over the cab roof, its sloped nose facing the airflow.
  k.compound('refrigerated_van_cooling_unit', 75, [
    box('feet', 'frame', [-0.5, s.roof, -0.62], [0.3, s.roof + 0.04, 0.62]),
    box('case', 'case', [-0.55, s.roof + 0.04, -0.72], [0.15, top, 0.72]),
    k.prism('nose', 'case', [[0.15, s.roof + 0.04], [0.42, s.roof + 0.04], [0.42, s.roof + 0.14], [0.15, top]], [-0.72, 0.72]),
    box('intake', 'grille', [0.42, s.roof + 0.06, -0.6], [0.43, s.roof + 0.13, 0.6]),
    box('intake_top', 'grille', [0.2, top - 0.1, -0.6], [0.3, top - 0.08, 0.6]),
  ] + k.bothSides([
    k.turned('fan', 'grille', 'y', k.disc(0.2, 0, 0.012), [-0.2, top, 0.36]) + { sides: 16 },
    k.turned('fan_hub', 'frame', 'y', k.disc(0.05, 0.012, 0.024), [-0.2, top, 0.36]) + { sides: 8 },
    box('side_louvre_low', 'grille', [-0.48, s.roof + 0.1, 0.72], [0.08, s.roof + 0.13, 0.73]),
    box('side_louvre_high', 'grille', [-0.48, s.roof + 0.19, 0.72], [0.08, s.roof + 0.22, 0.73]),
  ]), { case: 'plastic-gloss-white', frame: 'steel-grey', grille: 'plastic-black' }),
  k.compound('refrigerated_van_lining', 190, [
    box('ceiling', 'lining', [s.rear + 0.16, s.roof - 0.08, -0.84], [-0.04, s.roof - 0.04, 0.84]),
  ] + k.bothSides([
    box('wall', 'lining', [s.rear + 0.16, s.archTop + 0.02, 0.84], [-0.04, s.canton, 0.88]),
  ]), { lining: 'plastic-gloss-white' }),
]
