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
    bluntShockPerDamage: 2,
    treatmentSimSeconds: 8,
    wakeShock: 10,
    bloodLossPerSimSecond: 0.004,
    bloodRecoveryPerSimSecond: 0.002,
    shockRecoveryPerSimSecond: 0.1,
    advancedInfectionHealthLossPerSimSecond: 0.0005,
    fatigueRisePerGameHour: 4,
    // Resting clears a fixed share of a normal sleep, so sitting never beats sleeping.
    restFatigueRecoveryPerGameHour: normalSleep * 0.3,
    sleepFatigueRecoveryPerGameHour: normalSleep,
    // Sleeping rough (rest quality 0) clears this share of a normal sleep.
    roughSleepShare: 0.6,
    healthRecoveryPerGameHour: 2,
    sleepRecoveryFactor: 2,
    aimSwayPerDamage: 0.01,
    swingSlowdownPerDamage: 0.01,
    movementSlowdownPerDamage: 0.005,
    minimumMovementSpeed: 0.5,
  }],
}
