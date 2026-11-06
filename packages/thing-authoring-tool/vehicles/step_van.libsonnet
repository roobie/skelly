local k = import 'kit.libsonnet';
local s = import 'step_van.spec.libsonnet';
local van = import 'van-body.libsonnet';
local box = k.box;
local grain = 1 / 32;
local band = s.bands[0].y;
van.rows('step_van', s) + [
  // The far wall's walk-in door, matching the near side's sliding door outline.
  k.compound('step_van_far_door_trim', 3, [
    box('seam_rear', 'paint', [s.slideRear, s.sill, -s.side - grain], [s.slideRear + grain, band[0], -s.skin]),
    box('seam_rear_mid', 'paint', [s.slideRear, band[1], -s.side - grain], [s.slideRear + grain, s.waist, -s.skin]),
    box('seam_rear_upper', 'paint', [s.slideRear, s.waist, -s.glassOut - grain], [s.slideRear + grain, s.doorTop, -s.glassIn]),
    box('seam_front', 'paint', [s.bRear - grain, s.sill, -s.side - grain], [s.bRear, band[0], -s.skin]),
    box('seam_front_mid', 'paint', [s.bRear - grain, band[1], -s.side - grain], [s.bRear, s.waist, -s.skin]),
    box('seam_front_upper', 'paint', [s.bRear - grain, s.waist, -s.glassOut - grain], [s.bRear, s.doorTop, -s.glassIn]),
    box('seam_top', 'paint', [s.slideRear, s.doorTop - grain, -s.glassOut - grain], [s.bRear, s.doorTop, -s.glassIn]),
    box('handle', 'trim', [s.bRear - 0.2, s.waist - 0.15, -s.side - grain], [s.bRear - 0.04, s.waist - 0.11, -s.side]),
  ], { trim: 'plastic-black', paint: s.paint }),
]
