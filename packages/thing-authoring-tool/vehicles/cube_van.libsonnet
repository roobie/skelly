local k = import 'kit.libsonnet';
local s = import 'cube_van.spec.libsonnet';
local van = import 'van-body.libsonnet';
local b = s.box;
van.rows('cube_van', s) + [
  // The box's overhang above the cab roof.
  // Continues the box's own section, so its walls and roof line run on unbroken.
  k.compound('cube_van_peak', 70, [
    {
      id: 'peak', kind: 'prism', slot: 'paint', axis: 'x', start: 0, end: 0.85,
      profile: [[s.cabRoof, -b.glassOut], [b.canton, -b.glassOut], [b.roof, -b.roofSide], [b.roof, b.roofSide], [b.canton, b.glassOut], [s.cabRoof, b.glassOut]],
    },
    k.prism('nose', 'paint', [[0.85, s.cabRoof], [1.0, s.cabRoof + 0.2], [1.0, b.canton], [0.85, b.canton]], [-b.glassOut, b.glassOut]),
    k.prism('nose_top', 'paint', [[0.85, b.canton], [1.0, b.canton], [0.85, b.roof]], [-b.roofSide, b.roofSide]),
  ], { paint: s.paint }),
]
