local hinge(bones, limits) = { bones: bones, limits: [limits, [0, 0], [0, 0]] };
local ball(bones, flex, swing, twist) = { bones: bones, limits: [flex, twist, swing] };
{
  models: ['shambler', 'runner', 'brute', 'crawler', 'amalgam'],
  shortenedLegs: { absent: ['shin.L', 'shin.R'], omit: ['shin.L', 'shin.R', 'foot.L', 'foot.R'] },
  compound: { root: 'core', memberRoot: 'pelvis', limits: [[-0.5, 0.5], [-0.5, 0.5], [-0.5, 0.5]] },
  sweep: {
    models: ['shambler', 'runner', 'brute', 'crawler'],
    cuts: [[], ['head'], ['upperArm.L'], ['thigh.L', 'thigh.R'], []],
    spacingMetres: 3,
    startMetres: [0, -15],
    viewer: { x: 24, z: 5.5, yawDegrees: -25 },
    lieSeconds: 120,
    capacity: 64,
    finishSeconds: 12,
    crawlCuts: [['thigh.L'], ['thigh.L', 'thigh.R']],
    crawlDelaySeconds: 2,
  },
  timestep: 1 / 60,
  stepBudget: 600,
  maxStepsPerFrame: 8,
  footprintMetres: [2.5, 2.5, 2.5],
  gravity: -9.81,
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
    runner: { launchSpeed: 1.2 },
    brute: { launchSpeed: 1.2 },
    crawler: { launchSpeed: 1.2 },
  },
  crawlFall: {
    fallSeconds: 0.85,
    blendSeconds: 0.55,
    motion: { launchSpeed: 1.6, upwardLift: 0.15, spinSpeed: 0.4, hitDirectionWeight: 1, seedSpread: 0.3 },
  },
  downedDriftMetres: 2,
  debris: {
    impulseScale: 1,
    friction: 0.8,
    linearDamping: 0.8,
    angularDamping: 1.5,
  },
  flesh: {
    lieSeconds: 6,
    sinkSeconds: 1.5,
    sinkDepthMetres: 0.5,
    maxAgeSeconds: 20,
    launchSpeed: 3.5,
    launchLift: 1.5,
    launchSpin: 6,
    density: 1000,
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
