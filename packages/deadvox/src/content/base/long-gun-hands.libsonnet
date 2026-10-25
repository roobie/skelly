// A long gun's hold (`DESIGN.md`, "Models"). The butt seats in the shoulder pocket: right of and below the eye, and a
// little ahead of it so the lowered gun stays in the frame. Every gun's bore meets that seat, so the butt point sits
// on the bore above the butt plate. The gungen export says which firing hold the gun takes: a gun that exports a
// `grip` part has a pistol grip and takes the firing palm on the grip's right face, a little behind the grip point so
// the curled fingers close ahead of it. A gun that exports a `stock` part and no grip takes the firing palm on the
// stock wrist's right face above the grip point, fingers pointing down and ahead so they curl under the wrist and the
// thumb lies over its top. A gun that exports neither has no place for the firing hand, so the content fails to
// compile instead of guessing. The support palm presses into the forend's left face at the exported support contact,
// `forendLeft` giving that face's height and side, tilted a little under so the back of the hand faces out and down;
// the fingers point up and curl over the top, and the thumb closes under.
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

function(model, buttX, forendLeft) model {
  hands: {
    seat: [0.15, -0.1, -0.12],
    butt: [buttX, 0, 0],
    firing: firingHold(model),
    support: {
      at: [model.anchors.support[0], forendLeft[0], forendLeft[1]],
      palm: [0, 0.2588190, 0.9659258],
      fingers: [0, 0.9659258, -0.2588190],
      pose: 'forend',
    },
  },
}
