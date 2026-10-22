// The player's body (`DESIGN.md`, "Character"). Fatigue is sleep debt: 100 is what a normal sleep clears.
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
    shockPerDamage: { blunt: 2, cut: 0, pierce: 0, acid: 1 },
    // Acid eats the outermost worn layer, so clothing is a consumable (`packages/deadvox/docs/acid-zombie.md`).
    outerWearMultiplier: { blunt: 1, cut: 1, pierce: 1, acid: 4 },
    // Footwear and gloves are each limb's last layer, so a blow meets them only on a bare limb.
    coverage: {
      head: ['head'],
      torso: ['vest', 'torso'],
      leftArm: ['torso', 'hands'],
      rightArm: ['torso', 'hands'],
      leftLeg: ['legs', 'feet'],
      rightLeg: ['legs', 'feet'],
    },
    touchFirst: { ground: 'feet', hand: 'hands' },
    exposureRefusal: "You're burning",
    linger: { acid: { simSeconds: 5 } },
    landing: {
      safeSpeedMetresPerSimSecond: 11.5,
      damagePerSquaredSpeed: 0.129,
      damageSpread: { min: 0.2, max: 2 },
      kind: 'blunt',
      cause: 'a fall',
      regions: [
        { region: 'leftLeg', weight: 1 },
        { region: 'rightLeg', weight: 1 },
      ],
    },
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
          chancePerDamage: { blunt: 0.012, cut: 0.05, pierce: 0.04, acid: 0.006 },
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
          chancePerDamage: { blunt: 0.004, cut: 0.04, pierce: 0.05, acid: 0.0025 },
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
          chancePerDamage: { blunt: 0.0012, cut: 0.02, pierce: 0.02, acid: 0 },
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
          chancePerDamage: { blunt: 0.00025, cut: 0.006, pierce: 0.004, acid: 0 },
          drip: { rate: 6, size: 1.6 },
          pain: 20,
        },
      ],
    },
    // Pain (`DESIGN.md`, "Pain") is open-ended. knockoutAt is its balance point, where felt pain is meant to knock out
    // once the knockout lands (#654); until then nothing happens there. Tiers are shares of it.
    pain: {
      knockoutAt: 100,
      // A bite or stab hurts a little more than a blow of the same damage; a burn hurts most.
      perDamage: { blunt: 1.6, cut: 2, pierce: 2, acid: 3 },
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
    needs: {
      spawn: { calories: 40, hydration: 35, fatigue: 70, stamina: 100 },
      drainPerGameHour: { calories: 3, hydration: 5 },
      healthLossPerGameHour: { starving: 4, dehydrated: 8 },
      stamina: { sprintPerSimSecond: 5, recoverPerSimSecond: 4, wornRecoveryFactor: 0.5, windedBelow: 10 },
      full: { kcal: 2500, ml: 2500 },
      critical: [
        { need: 'calories', below: 10, message: "You're starving" },
        { need: 'hydration', below: 10, message: "You're parched" },
        { need: 'fatigue', above: 90, message: "You're exhausted" },
      ],
      badlyHurt: { below: 25, message: "You're badly hurt" },
    },
    // Gains are provisional loudness tuning.
    heartbeat: {
      sounds: { slow: 'player_heartbeat_slow', fast: 'player_heartbeat_fast' },
      startStamina: 85,
      startHz: 1,
      exhaustedHz: 3,
      startGain: 0.12,
      exhaustedGain: 0.8,
    },
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
