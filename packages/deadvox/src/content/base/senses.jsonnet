local crouch = {
  speedMetresPerSimSecond: 1,
  hearingRangeScale: 0.5,
  sightRangeScale: 0.5,
  eyeDropMetres: 0.7,
  bodyHeightMetres: 1.2,
};

{
  senses: [
    {
      id: 'player',
      movement: {
        sidewaysSpeedScale: 0.7,
        backwardSpeedScale: 0.5,
      },
      chestEyeFraction: 0.62,
      crouch: crouch,
      // Hearing and sight copy crouch's until BR rules on lying down (#550).
      prone: {
        speedMetresPerSimSecond: 0.5,
        hearingRangeScale: crouch.hearingRangeScale,
        sightRangeScale: crouch.sightRangeScale,
        eyeDropMetres: 1.3,
        bodyHeightMetres: 0.6,
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
        groundLight: { senseHeightMetres: 0.075, renderLiftMetres: 0.4 },
      },
    },
  ],
}
