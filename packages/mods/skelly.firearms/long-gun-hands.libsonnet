// Furniture-specific palm contacts preserve the difference between wrapping a stock wrist and a pistol grip.
// Keep the stock contact at the exported wrist height: lifting it makes the hand ride on top of the stock.
local firingHold(model) =
  if std.objectHas(model.parts, 'grip') then {
    at: [model.grip.at[0] - 0.02, model.grip.at[1], 0.016],
    palm: [0, 0, -1],
    fingers: [1, 0, 0],
    pose: 'pistolGrip',
  } else if std.objectHas(model.parts, 'stock') then {
    at: [model.grip.at[0], model.grip.at[1], 0.012],
    palm: [0, 0, -1],
    fingers: [0.7660444, -0.6427876, 0],
    pose: 'stockWrist',
  } else
    error 'long gun %s exports neither a grip part nor a stock part, so no firing hold fits it' % [model.id];

// Lying prone, the support hand takes the gun this far ahead of the firing grip so the elbow can rest on the ground.
local proneSupportAheadOfGripMetres = 0.04;

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
    proneSupport: {
      at: [model.grip.at[0] + proneSupportAheadOfGripMetres, model.anchors.support[1], 0],
    },
  },
}
