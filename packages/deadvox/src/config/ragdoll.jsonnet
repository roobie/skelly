local hinge(bones, limits) = { bones: bones, limits: [limits, [0, 0], [0, 0]] };
local ball(bones, flex, swing, twist) = { bones: bones, limits: [flex, twist, swing] };
{
  shortenedLegs: { absent: ['shin.L', 'shin.R'], omit: ['shin.L', 'shin.R', 'foot.L', 'foot.R'] },
  compound: { root: 'core', memberRoot: 'pelvis', limits: [[-0.5, 0.5], [-0.5, 0.5], [-0.5, 0.5]] },
  sweep: {
    models: ['humanoid', 'slim-humanoid', 'broad-humanoid', 'legless-humanoid'],
    cuts: [[], ['head'], ['upperArm.L'], ['thigh.L', 'thigh.R'], []],
    spacingMetres: 3,
    startMetres: [0, -15],
    viewer: { x: 55.5, z: 5.5, yawDegrees: -25 },
    lieSeconds: 120,
    capacity: 64,
    finishSeconds: 12,
    crawlCuts: [['thigh.L'], ['thigh.L', 'thigh.R']],
    crawlDelaySeconds: 2,
  },
  // Kilograms per cubic metre of actor body voxels; ragdoll masses and inertia follow from it.
  density: 1000,
  timestep: 1 / 60,
  stepBudget: 600,
  maxStepsPerFrame: 8,
  footprintMetres: [2.5, 2.5, 2.5],
  friction: 0.8,
  linearDamping: 0.8,
  angularDamping: 1.5,
  motion: {
    launchSpeed: 1.2,
    upwardLift: 0,
    spinSpeed: 0,
    hitDirectionWeight: 1,
    seedSpread: 0.3,
  },
  kindMotion: {
    'slim-humanoid': { launchSpeed: 1.2 },
    'broad-humanoid': { launchSpeed: 1.2 },
    'legless-humanoid': { launchSpeed: 1.2 },
  },
  crawlFall: {
    fallSeconds: 0.85,
    blendSeconds: 0.55,
    motion: { upwardLift: 0.15, spinSpeed: 0.4 },
    motionScale: { launchSpeed: 4 / 3 },
  },
  downedDriftMetres: 2,
  debris: {
    impulseScale: 1,
    friction: 0.8,
    linearDamping: 0.8,
    angularDamping: 1.5,
  },
  viewer: { blockSizeMetres: 1 },
  modelGroups: {
    dog: [
      { bones: ['pelvis', 'spine'], limits: null },
      ball(['neck', 'head'], [-0.7, 0.7], [-0.6, 0.6], [-0.8, 0.8]),
      hinge(['jaw'], [0, 0.7]),
      ball(['tail'], [-0.7, 0.7], [-0.6, 0.6], [-0.8, 0.8]),
    ] + std.flattenArrays([
      [
        ball([limb + 'Upper.' + side], [-1.5, 1.5], [-1.2, 1.2], [-1, 1]),
        hinge([limb + 'Lower.' + side, limb + 'Paw.' + side], [-2.4, 0.1]),
      ]
      for limb in ['fore', 'hind']
      for side in ['L', 'R']
    ]),
  },
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
