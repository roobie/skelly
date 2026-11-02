local crouch = {
  hearingRangeScale: 0.5,
  sightRangeScale: 0.5,
};

{
  senses: [
    {
      id: 'player', capability: 'player',
      chestEyeFraction: 0.62,
      // Holding the crouch key this long lies down instead of toggling crouch.
      crouchProneHoldRealSeconds: 0.5,
      crouch: crouch,
      // Hearing and sight copy crouch's until BR rules on lying down (#550).
      prone: {
        hearingRangeScale: crouch.hearingRangeScale,
        sightRangeScale: crouch.sightRangeScale,
      },
      wall: {
        hearingRangeScale: 0.5,
        gain: 0.55,
        cutoffHz: 1800,
        clearGain: 1,
        clearCutoffHz: 18000,
      },
      footsteps: {
        walkingStepMetres: 0.75,
        joggingStepMetres: 1.2,
        sprintingStepMetres: 1.6,
        hardLandingMetres: 2.5,
      },
      vocalNoiseLifetimeSimSeconds: 0.5,
      // The tiny end is pitched above the old law and the large end keeps its old-law pitch.
      shamblerVoice: {
        oldLawReferenceHeightMetres: 1.7,
        smallestAnchorMultiplier: 1.2,
        clampMultiplier: { min: 0.5, max: 1.3 },
      },
      light: {
        playerDaySightScale: 0,
        lureRangeScale: 0.5,
        throwMaxDistanceMetres: 16,
        throwChargeSimSeconds: 1.25,
        throwMinimumHoldSimSeconds: 0.3,
        throwStanceDropHoldRealSeconds: 0.5,
        wornLightToggleHoldRealSeconds: 0.5,
        renderedBeamLimit: 2,
        // Lights a room the size of the test-house garage, with its strip lights and lamp, all at once, so walking
        // around never swaps which fixture is dark. Each slot adds light work to every lit pixel.
        renderedFixtureLimit: 8,
        throwArmSpeedMetresPerRealSecond: 9,
        throwArmEnergyJoules: 60,
        groundLight: { senseHeightMetres: 0.075, renderLiftMetres: 0.4 },
        // Above the night sky, below dusk and a lantern held close.
        // nearFieldMetres caps close-surface blowout for lights tuned for reach.
        illumination: { pointDecay: 1, nearFieldMetres: 4, readingThreshold: 0.6 },
      },
    },
  ],
}
