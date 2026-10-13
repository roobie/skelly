// The player's body (DESIGN.md, "Needs"). Fatigue is sleep debt: 100 is what a normal sleep clears.
local normalSleepGameHours = 8;
local normalSleep = 100 / normalSleepGameHours;

{
  body: [{
    id: 'player',
    infectionOnsetGameHours: 2,
    antisepticWindowGameHours: 12,
    infectionChance: 0.5,
    knockoutSimSeconds: 20,
    staminaRegenDelaySimSeconds: 5,
    proneEyeHeightMetres: 0.3,
    shockPerDamage: { blunt: 2, cut: 0, pierce: 0 },
    treatmentSimSeconds: 8,
    treatmentSpread: { min: 0.5, max: 1.5 },
    wakeShock: 10,
    bleeding: {
      refusal: "You're bleeding",
      blockCompressionAtLossPerSimSecond: 0,
      tiers: [
        {
          id: 'scratch',
          label: 'Scratch',
          warn: false,
          bloodLossPerSimSecond: 0.002,
          closeSimSeconds: 180,
          treatmentEffort: 1,
          minDamage: 0,
          chance: { blunt: 0.1, cut: 0.4, pierce: 0.3 },
          drip: { rate: 0.2, size: 0.75 },
          pain: 1,
        },
        {
          id: 'moderate',
          label: 'Moderate bleeding',
          warn: true,
          notice: "You're bleeding moderately.",
          bloodLossPerSimSecond: 0.015,
          closeSimSeconds: 7200,
          treatmentEffort: 1,
          minDamage: 5,
          chance: { blunt: 0.03, cut: 0.35, pierce: 0.4 },
          drip: { rate: 1, size: 1 },
          pain: 5,
        },
        {
          id: 'heavy',
          label: 'Heavy bleeding',
          warn: true,
          notice: "You're bleeding heavily.",
          bloodLossPerSimSecond: 0.12,
          closeSimSeconds: 21600,
          treatmentEffort: 2,
          minDamage: 8,
          chance: { blunt: 0.01, cut: 0.15, pierce: 0.15 },
          drip: { rate: 2.5, size: 1.3 },
          pain: 10,
        },
        {
          id: 'arterial',
          label: 'Arterial bleeding',
          warn: true,
          notice: "You're bleeding from an artery.",
          bloodLossPerSimSecond: 1.67,
          closeSimSeconds: 86400,
          treatmentEffort: 4,
          minDamage: 12,
          regionFactor: { torso: 0.5 },
          chance: { blunt: 0.002, cut: 0.05, pierce: 0.03 },
          drip: { rate: 6, size: 1.6 },
          pain: 20,
        },
      ],
    },
    // Pain (DESIGN.md, "Pain") is open-ended. knockoutAt is its balance point, where felt pain is meant to knock out
    // once the knockout lands (#654); until then nothing happens there. Tiers are shares of it.
    pain: {
      knockoutAt: 100,
      // A bite or stab hurts a little more than a blow of the same damage.
      perDamage: { blunt: 1.6, cut: 2, pierce: 2 },
      regionWeight: { head: 1.5, torso: 1, leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 },
      perRegionDamage: 0.5,
      infection: { early: 8, advanced: 20 },
      // A fresh hit's sting is mostly gone within a few real minutes.
      acuteFadePerSimSecond: 0.05,
      acuteFadeSharePerSimSecond: 0.01,
      aimSway: { perShare: 1.2, max: 1 },
      handlingSlowdown: { perShare: 0.6, max: 0.5 },
      tiers: [
        { id: 'mild', from: 0.1, desaturation: 0.1, pulseIntervalRealSeconds: 30 },
        { id: 'moderate', from: 0.3, notice: 'That really hurts.', desaturation: 0.2, pulseIntervalRealSeconds: 15 },
        { id: 'severe', from: 0.6, notice: "You're in a lot of pain.", desaturation: 0.35, pulseIntervalRealSeconds: 8 },
        { id: 'excruciating', from: 0.85, notice: 'The pain is unbearable.', desaturation: 0.5, pulseIntervalRealSeconds: 4 },
      ],
    },
    bloodRecoveryPerSimSecond: 0.002,
    shockRecoveryPerSimSecond: 0.1,
    advancedInfectionHealthLossPerSimSecond: 0.0005,
    fatigueRisePerGameHour: 4,
    // Resting clears a fixed share of a normal sleep, so sitting never beats sleeping.
    restFatigueRecoveryPerGameHour: normalSleep * 0.3,
    sleepFatigueRecoveryPerGameHour: normalSleep,
    sleepOnset: {
      minGameMinutes: 2,
      maxGameMinutes: 20,
      fatigueAtMinimum: 100,
    },
    // Sleeping rough (rest quality 0) clears this share of a normal sleep.
    roughSleepShare: 0.6,
    healthRecoveryPerGameHour: 2,
    // Too hungry or thirsty, you don't heal.
    healthRecoveryNeedsFloor: { calories: 25, hydration: 25 },
    // Too tired, you don't heal while awake; sleep heals at any fatigue, so asleep has no ceiling.
    healthRecoveryFatigueCeiling: { awake: 80 },
    sleepRecoveryFactor: 2,
    aimSwayPerDamage: 0.01,
    swingSlowdownPerDamage: 0.01,
    movementSlowdownPerDamage: 0.005,
    minimumMovementSpeed: 0.5,
  }],
}
