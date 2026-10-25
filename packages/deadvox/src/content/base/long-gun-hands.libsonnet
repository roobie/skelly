// A long gun's hold (`DESIGN.md`, "Models"). The butt seats in the shoulder pocket: right of and below the eye, and a
// little ahead of it so the lowered gun stays in the frame. Every gun's bore meets that seat, so the butt point sits
// on the bore above the butt plate. The gungen export says which firing hold the gun takes: a gun that exports a
// `grip` part has a pistol grip and takes the firing palm on the grip's right face, a little behind the grip point so
// the curled fingers close ahead of it. A gun that exports a `stock` part and no grip takes the firing palm on the
// stock wrist's right face above the grip point, fingers pointing down and ahead so they curl under the wrist and the
// thumb lies over its top. A gun that exports neither has no place for the firing hand, so the content fails to
// compile instead of guessing. The support palm cups the forend from below at the exported support anchor,
// whose height gungen reads off the drawn forend's underside, so the bore runs across the palm from its heel
// to the gap between thumb and index: the fingers point forward and 38 degrees toward the gun's far side, curling
// up that side, and the thumb lies forward along the near side.
local firingHold(model) =
  if std.objectHas(model.parts, 'grip') then {
    at: [model.grip.at[0] - 0.02, model.grip.at[1], 0.016],
    palm: [0, 0, -1],
    fingers: [1, 0, 0],
    pose: 'pistolGrip',
  } else if std.objectHas(model.parts, 'stock') then {
    at: [model.grip.at[0], model.grip.at[1] + 0.01, 0.012],
    palm: [0, 0, -1],
    fingers: [0.7660444, -0.6427876, 0],
    pose: 'stockWrist',
  } else
    error 'long gun %s exports neither a grip part nor a stock part, so no firing hold fits it' % [model.id];

function(model, buttX) model {
  hands: {
    seat: [0.15, -0.1, -0.12],
    butt: [buttX, 0, 0],
    firing: firingHold(model),
    support: {
      at: [model.anchors.support[0], model.anchors.support[1], 0],
      palm: [0, 1, 0],
      fingers: [0.7880108, 0, 0.6156615],
      pose: 'forend',
    },
  },
}
