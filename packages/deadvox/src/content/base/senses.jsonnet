{
  senses: [
    {
      id: 'player',
      movement: {
        sidewaysSpeedScale: 0.7,
        backwardSpeedScale: 0.5,
      },
      chestEyeFraction: 0.62,
      crouch: {
        speedMetresPerSimSecond: 1,
        hearingRangeScale: 0.5,
        sightRangeScale: 0.5,
        eyeDropMetres: 0.7,
        bodyHeightMetres: 1.2,
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
        throwArmSpeedMetresPerRealSecond: 9,
        throwArmEnergyJoules: 60,
      },
    },
  ],
}
