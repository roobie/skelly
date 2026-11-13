// Points and directions are in the gun's model frame: bore along +z, up +y, its right at -x.
// Furniture-specific palm contacts preserve the difference between wrapping a stock wrist and a pistol grip.
// Keep the stock contact at the exported wrist height: lifting it makes the hand ride on top of the stock.
local firingHold(model) =
  if std.objectHas(model.parts, 'grip') then {
    at: [-0.016, model.grip.at[1], model.grip.at[2] - 0.02],
    palm: [1, 0, 0],
    fingers: [0, 0, 1],
    pose: 'pistolGrip',
  } else if std.objectHas(model.parts, 'stock') then {
    at: [-0.012, model.grip.at[1], model.grip.at[2]],
    palm: [1, 0, 0],
    fingers: [0, -0.6427876, 0.7660444],
    pose: 'stockWrist',
  } else
    error 'long gun %s exports neither a grip part nor a stock part, so no firing hold fits it' % [model.id];

// Lying prone, the support hand takes the gun this far ahead of the firing grip so the elbow can rest on the ground.
local proneSupportAheadOfGripMetres = 0.04;

function(model, buttZ) model {
  hands: {
    seat: [0.15, -0.1, -0.12],
    butt: [0, 0, buttZ],
    firing: firingHold(model),
    support: {
      at: [0, model.anchors.support[1], model.anchors.support[2]],
      palm: [0, 1, 0],
      fingers: [-0.6156615, 0, 0.7880108],
      pose: 'forend',
    },
    proneSupport: {
      at: [0, model.anchors.support[1], model.grip.at[2] + proneSupportAheadOfGripMetres],
    },
  },
}
