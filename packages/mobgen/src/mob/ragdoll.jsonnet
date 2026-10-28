local hinge(bones, limits) = { bones: bones, limits: [limits, [0, 0], [0, 0]] };
local ball(bones, flex, swing, twist) = { bones: bones, limits: [flex, twist, swing] };
{
  models: ['shambler'],
  timestep: 1 / 60,
  stepBudget: 600,
  maxStepsPerFrame: 8,
  footprintMetres: [2.5, 2.5, 2.5],
  gravity: -9.81,
  friction: 0.8,
  linearDamping: 0.8,
  angularDamping: 1.5,
  launchSpeed: 1.2,
  seedSpread: 0.3,
  groups: [
    { bones: ['pelvis', 'spine', 'chest'], limits: null },
    ball(['neck', 'head'], [-0.7, 0.7], [-0.6, 0.6], [-0.8, 0.8]),
    hinge(['jaw'], [0, 0.7]),
  ] + std.flattenArrays([
    [
      ball(['upperArm.' + side], [-1.5, 1.5], [-1.2, 1.2], [-1, 1]),
      hinge(['forearm.' + side, 'hand.' + side], [-2.4, 0.1]),
      ball(['thigh.' + side], [-1.5, 0.6], [-0.7, 0.7], [-0.5, 0.5]),
      hinge(['shin.' + side, 'foot.' + side], [-0.1, 2.4]),
    ]
    for side in ['L', 'R']
  ]),
}
