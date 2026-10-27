local material(color, emissive=0) = { color: color, emissive: emissive };
{
  name: 'skeleton',
  description: 'Bare voxel bones on the humanoid rig: separate ribs, open jaw and glowing eye sockets.',
  bodyPlan: 'skeleton',
  status: 'comparison-only',
  // The shared-rig attack clip this content selects (attack.ts, ATTACK_CLIPS owns the ids).
  attackClip: 'swipe',
  flinchClip: 'hit-flinch',
  bodyMassKg: 12,
  sizeReference: 'shambler',
  supportBones: ['foot.L', 'foot.R'],
  materials: {
    bone: material([0.86, 0.83, 0.71]),
    grime: material([0.47, 0.43, 0.31]),
    socket: material([0.10, 0.08, 0.07]),
    eye: material([1.0, 0.56, 0.14], 1),
  },
  // The bone colour is drawn between `materials.bone` and this by `boneTint`.
  boneB: [0.74, 0.72, 0.57],
  params: {
    // The skeleton has no bulk: its stance width is this explicit target (gait.ts, stanceWidthTarget),
    // not a girth-derived one.
    stepWidth: { min: 0.2, max: 0.24 },
    shoulderWidth: { min: 1.15, max: 1.3 },
    hipWidth: { min: 0.9, max: 1.05 },
    headScale: { min: 0.96, max: 1.06 },
    armLength: { min: 0.95, max: 1.05 },
    legLength: { min: 0.96, max: 1.04 },
    hunch: { min: 0, max: 8 },
    kneeBend: { min: 0, max: 8 },
    headTilt: { choices: [-5, 0, 0, 5] },
    jawGape: { min: 10, max: 24 },
    boneTint: { min: 0, max: 1 },
    armSwing: { min: 6, max: 16 },
    armRaise: { choices: [0, 0, 0, 10] },
    limp: { min: 0, max: 0.2 },
    strideFactor: { min: 0.9, max: 1.1 },
    pelvisSway: { min: 1, max: 4 },
    spineTwist: { min: 2, max: 6 },
    headLoll: { min: 2, max: 8 },
    jawChatter: { min: 5, max: 20 },
    footLift: { min: 0.03, max: 0.06 },
  },
  budgets: {
    totalVoxels: { min: 450, max: 1400 },
    totalTriangles: { min: 1600, max: 4500 },
    groups: {
      head: { bones: ['head', 'jaw'], min: 110, max: 520 },
    },
  },
  // Lengths are fractions of the sampled height unless named for voxels; skull parts are fractions of
  // the skull's own height (skullFraction x height x headScale).
  geometry: {
    crispBlend: 0.006,
    skullFraction: 0.15,
    faceForward: 0.45,
    // The head bone ends this far up the skull, inside the crown.
    headBoneLength: 0.8,
    craniumBottom: 0.3, craniumBack: 0.42, craniumWidth: 0.5, craniumRound: 0.1,
    maxillaBottom: 0.04, maxillaTop: 0.6, maxillaBack: 0.1, maxillaWidth: 0.36,
    jawTop: 0.06, jawBack: -0.05, jawDrop: 0.2, jawWidth: 0.34,
    // Face holes are counted in voxels; each is carved `depth` columns back and painted behind.
    eyeHeight: 0.55, eyeOffset: 0.22, eyeRows: 2, eyeColumns: 2, eyeDepthVoxels: 1,
    noseHeight: 0.33, noseRows: 1, noseColumns: 1, noseDepthVoxels: 1,
    teethPitchVoxels: 2,
    neckReach: 0.2,
    spineRadiusVoxels: 0.75, vertebraHalf: [0.022, 0.016], vertebraRows: 1, vertebraPitchVoxels: 2,
    neckVertebraScale: 0.7,
    ribTop: 0.03, ribPitch: 0.042, ribScale: [0.8, 0.95, 1.0, 0.97, 0.85],
    ribHalfWidth: 0.068, ribDepth: 0.05, ribRadiusVoxels: 0.7, ribSegments: 10, ribFrontGapDeg: 25,
    ribBlend: 0.002, sternumRibs: 3, sternumRiseVoxels: 1, sternumHalf: [0.014, 0.012], clavicleRadiusVoxels: 0.75,
    sacrumRise: 0.03, sacrumBack: 0.01, sacrumHalf: [0.028, 0.04, 0.018],
    pubisDrop: 0.03, pubisForward: 0.015, pubisHalf: [0.012, 0.014],
    iliumOut: 0.062, iliumRise: 0.035, iliumHalf: [0.03, 0.03, 0.02], iliumFlareDeg: 15,
    socketRadius: 0.022,
    knobHalf: 0.022, kneeWidth: 1.1,
    upperArmRadius: 0.021, forearmRadius: 0.021, thighRadius: 0.024, shinRadius: 0.022,
    // How far the fingertips reach past the wrist (a fraction of height), long enough for four separate
    // fingers to show below the palm; the hand bone itself stops near the palm (skeleton.ts, skeletonLayout).
    handLength: 0.11,
    palmLength: 0.05, palmHalf: [0.012, 0.03],
    // Fingers root this far into the palm; the thumb splays this many degrees off the hand's axis.
    // Spacing is whole voxel columns: each finger owns a column with an air column between neighbours.
    fingerCount: 4, fingerSpacingVoxels: 2, fingerRadiusVoxels: 0.6, fingerRootDepth: 0.5,
    thumbStart: 0.2, thumbLength: 0.028, thumbSplayDeg: 35,
    kneeSpread: 0.072, footSpread: 0.074,
    heelBack: 0.025, heelForward: 0.01, footHalfWidth: 0.045, footBall: 0.55, archHeight: 0.035,
    // Toes sit on adjacent columns; every other one roots back by the recess so five share the span
    // three wide-spaced toes did, each tip clear of its neighbours.
    toeCount: 5, toeSpacingVoxels: 1, toeRadiusVoxels: 0.6, toeStartVoxels: 1, toeRecessVoxels: 1,
    grimeScale: 0.05, grimeThreshold: 0.28,
  },
  gaze: {
    neck: { yawDeg: 25, pitchDeg: 20 },
    head: { yawDeg: 35, pitchDeg: 25 },
    turnRateDegPerSecond: 120,
  },
}
